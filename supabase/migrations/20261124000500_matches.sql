-- =============================================================================
-- Football Legends — Phase 7: match results, rewards and progression
--
-- Trust model: the match engine runs on our server (deterministic, seeded).
-- Its result is stored by public.record_match(), which ONLY the service role
-- can execute — signed-in users cannot call it, so they cannot report their
-- own scores. The database, not the app, decides rewards (from score and
-- difficulty), enforces a cooldown and a daily reward cap, levels players up
-- and pays coins through the ledger.
-- =============================================================================

alter table public.matches
  add column difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  add column idempotency_key text check (char_length(idempotency_key) between 8 and 120),
  add column rewarded boolean not null default true,
  add constraint matches_idempotency_unique unique (user_id, idempotency_key);

-- --------------------------------------------------------------- progression
-- Mirrors web/src/lib/game/progression.ts: total XP to reach level L = 50·L·(L−1), max 99.
create or replace function public.level_for_xp(p_xp bigint)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Closed form L = (1 + sqrt(1 + xp/12.5)) / 2, then a one-step correction
  -- for floating-point error at exact thresholds.
  with b as (
    select greatest(p_xp, 0) as x,
           greatest(1, floor((1 + sqrt(1 + greatest(p_xp, 0) / 12.5)) / 2)::int) as l
  )
  select least(99, case
           when 50::bigint * (l + 1) * l <= x then l + 1
           when 50::bigint * l * (l - 1) > x then l - 1
           else l end)
    from b;
$$;
revoke execute on function public.level_for_xp(bigint) from public, anon;
grant execute on function public.level_for_xp(bigint) to authenticated;

-- ------------------------------------------------------------------ rewards
-- Single source of truth for match rewards (also shown in the Match Centre).
create or replace function public.match_rewards()
returns table (difficulty text, result text, coins integer, xp integer)
language sql
immutable
set search_path = ''
as $$
  select d.difficulty, r.result,
         round(r.coins * d.mult)::int,
         round(r.xp * d.mult)::int
    from (values ('easy', 0.75), ('normal', 1.0), ('hard', 1.5)) as d(difficulty, mult)
   cross join (values ('win', 150, 50), ('draw', 75, 30), ('loss', 40, 20)) as r(result, coins, xp);
$$;
revoke execute on function public.match_rewards() from public, anon;
grant execute on function public.match_rewards() to authenticated;

-- Limits (also read by the UI).
create or replace function public.match_limits()
returns table (rewarded_per_day integer, max_per_day integer, cooldown_seconds integer, goal_bonus integer, goal_bonus_cap integer)
language sql immutable set search_path = ''
as $$ select 20, 60, 5, 10, 50 $$;
revoke execute on function public.match_limits() from public, anon;
grant execute on function public.match_limits() to authenticated;

-- -------------------------------------------------------------- record_match
-- p_payload: {
--   "seed": int, "engine_version": text, "tactic": text, "difficulty": text,
--   "opponent_name": text, "opponent_rating": int,
--   "home_score": int, "away_score": int, "stats": {...}, "team_snapshot": {...},
--   "events": [{"minute": int, "type": text, "side": "home"|"away"|null,
--               "player_name": text, "assist_player_name": text,
--               "ownership_id": uuid|null, "assist_ownership_id": uuid|null, "detail": text}]
-- }
create or replace function public.record_match(
  p_user_id         uuid,
  p_team_id         uuid,
  p_idempotency_key text,
  p_payload         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing   uuid;
  v_match      uuid;
  v_home       int;
  v_away       int;
  v_difficulty text := p_payload ->> 'difficulty';
  v_result     text;
  v_coins      int := 0;
  v_xp         int := 0;
  v_today      int;
  v_rewarded   int;
  v_last       timestamptz;
  v_capacity   int;
  v_limits     record;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Serialise this user's matches (cooldown, daily counts, rewards).
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select id into v_existing from public.matches where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if not exists (select 1 from public.teams where id = p_team_id and user_id = p_user_id) then
    raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Validate the payload shape (the engine is trusted, but be strict anyway).
  begin
    v_home := (p_payload ->> 'home_score')::int;
    v_away := (p_payload ->> 'away_score')::int;
  exception when others then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end;
  if v_home is null or v_away is null or v_home not between 0 and 20 or v_away not between 0 and 20
     or v_difficulty not in ('easy', 'normal', 'hard')
     or (p_payload ->> 'tactic') not in ('balanced', 'attacking', 'defensive')
     or jsonb_typeof(p_payload -> 'events') <> 'array'
     or jsonb_array_length(p_payload -> 'events') > 300
     or (p_payload ->> 'seed') is null or (p_payload ->> 'engine_version') is null then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_payload -> 'events') e where e ->> 'type' = 'goal' and e ->> 'side' = 'home') <> v_home
     or (select count(*) from jsonb_array_elements(p_payload -> 'events') e where e ->> 'type' = 'goal' and e ->> 'side' = 'away') <> v_away then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end if;

  select * into v_limits from public.match_limits();
  select max(created_at) into v_last from public.matches where user_id = p_user_id;
  if v_last is not null and v_last > now() - make_interval(secs => v_limits.cooldown_seconds) then
    raise exception 'MATCH_COOLDOWN' using errcode = 'P0001';
  end if;
  select count(*), count(*) filter (where rewarded) into v_today, v_rewarded
    from public.matches
   where user_id = p_user_id and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_today >= v_limits.max_per_day then
    raise exception 'MATCH_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  -- Rewards (decided here, never by the caller).
  v_result := case when v_home > v_away then 'win' when v_home = v_away then 'draw' else 'loss' end;
  if v_rewarded < v_limits.rewarded_per_day then
    select r.coins, r.xp into v_coins, v_xp from public.match_rewards() r where r.difficulty = v_difficulty and r.result = v_result;
    select capacity into v_capacity from public.stadiums where user_id = p_user_id;
    v_coins := v_coins + least(v_home * v_limits.goal_bonus, v_limits.goal_bonus_cap) + coalesce(v_capacity, 0) / 100;
  end if;

  insert into public.matches (
    user_id, team_id, team_snapshot, opponent_name, opponent_rating, tactic, seed, engine_version,
    status, home_score, away_score, stats, reward_coins, xp_gained, completed_at, difficulty,
    idempotency_key, rewarded
  ) values (
    p_user_id, p_team_id, coalesce(p_payload -> 'team_snapshot', '{}'::jsonb),
    left(coalesce(p_payload ->> 'opponent_name', 'Opponent'), 60),
    least(99, greatest(0, coalesce((p_payload ->> 'opponent_rating')::int, 0))),
    (p_payload ->> 'tactic')::public.match_tactic, (p_payload ->> 'seed')::bigint, left(p_payload ->> 'engine_version', 20),
    'completed', v_home, v_away, coalesce(p_payload -> 'stats', '{}'::jsonb), v_coins, v_xp, now(), v_difficulty,
    p_idempotency_key, v_coins > 0 or v_xp > 0
  ) returning id into v_match;

  insert into public.match_events (match_id, seq, minute, event_type, side, player_name, assist_player_name, ownership_id, assist_ownership_id, detail)
  select v_match, (ord - 1)::smallint,
         least(130, greatest(0, (e ->> 'minute')::int))::smallint,
         (e ->> 'type')::public.match_event_type,
         nullif(e ->> 'side', '')::public.match_side,
         left(e ->> 'player_name', 60), left(e ->> 'assist_player_name', 60),
         -- only link cards the user actually owns
         (select co.id from public.card_ownership co where co.id = (nullif(e ->> 'ownership_id', ''))::uuid and co.user_id = p_user_id),
         (select co.id from public.card_ownership co where co.id = (nullif(e ->> 'assist_ownership_id', ''))::uuid and co.user_id = p_user_id),
         left(e ->> 'detail', 200)
    from jsonb_array_elements(p_payload -> 'events') with ordinality as t(e, ord);

  if v_coins > 0 then
    perform private.apply_coin_transaction(p_user_id, v_coins, 'match_reward', 'match:' || v_match::text, 'match', v_match);
  end if;
  if v_xp > 0 then
    update public.profiles set xp = xp + v_xp, level = public.level_for_xp(xp + v_xp)
     where id = p_user_id;
  end if;

  perform private.audit(p_user_id, 'match_played', jsonb_build_object(
    'match_id', v_match, 'score', v_home || '-' || v_away, 'difficulty', v_difficulty, 'coins', v_coins, 'xp', v_xp));
  return v_match;
end;
$$;

-- Only the server (service role) may record results. Users cannot call it.
revoke execute on function public.record_match(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_match(uuid, uuid, text, jsonb) to service_role;

create index matches_user_day_idx on public.matches (user_id, created_at) where status = 'completed';
