-- =============================================================================
-- Football Legends — interactive matches ("key moments")
--
-- A match is now created at kick-off (status 'in_progress') and settled at full
-- time. In between, the home manager makes decisions at key moments; each one is
-- stored BEFORE its outcome is shown, so a moment can't be retried and quitting
-- can't dodge a result (an abandoned match pays nothing and still counts towards
-- the daily match limit). Everything stays service-role only: players never
-- write match data, and the server derives every result from the seed + decisions.
--
--   start_match          kick-off: validates limits, creates the in-progress row
--   record_match_decision appends one decision (strict order, idempotent)
--   finish_match         full time: validates the result, pays rewards
--   record_match         unchanged contract (start + finish in one call)
-- =============================================================================

alter table public.matches
  add column decisions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(decisions) = 'array' and jsonb_array_length(decisions) <= 10);

-- ----------------------------------------------------------- open (kick-off)
create or replace function private.open_match(
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
  v_difficulty text := p_payload ->> 'difficulty';
  v_today      int;
  v_last       timestamptz;
  v_limits     record;
  v_opponent   uuid;
  v_opp_team   uuid;
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

  begin
    v_opponent := nullif(p_payload ->> 'opponent_user_id', '')::uuid;
    v_opp_team := nullif(p_payload ->> 'opponent_team_id', '')::uuid;
  exception when others then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end;
  if v_difficulty not in ('easy', 'normal', 'hard')
     or (p_payload ->> 'tactic') not in ('balanced', 'attacking', 'defensive')
     or (p_payload ->> 'seed') is null or (p_payload ->> 'engine_version') is null then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end if;

  -- Friend match: a real, different manager's own squad; always "normal" rewards.
  if v_opponent is not null or v_opp_team is not null then
    if v_opponent is null or v_opp_team is null then
      raise exception 'INVALID_MATCH' using errcode = '22023';
    end if;
    if v_opponent = p_user_id then
      raise exception 'CANNOT_CHALLENGE_SELF' using errcode = '22023';
    end if;
    if not exists (select 1 from public.teams where id = v_opp_team and user_id = v_opponent) then
      raise exception 'OPPONENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_difficulty := 'normal';
  end if;

  select * into v_limits from public.match_limits();
  select max(created_at) into v_last from public.matches where user_id = p_user_id;
  if v_last is not null and v_last > now() - make_interval(secs => v_limits.cooldown_seconds) then
    raise exception 'MATCH_COOLDOWN' using errcode = 'P0001';
  end if;
  select count(*) into v_today
    from public.matches
   where user_id = p_user_id and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_today >= v_limits.max_per_day then
    raise exception 'MATCH_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.matches (
    user_id, team_id, team_snapshot, opponent_name, opponent_rating, tactic, seed, engine_version,
    status, stats, difficulty, idempotency_key, rewarded, opponent_user_id, opponent_team_id
  ) values (
    p_user_id, p_team_id, coalesce(p_payload -> 'team_snapshot', '{}'::jsonb),
    left(coalesce(p_payload ->> 'opponent_name', 'Opponent'), 60),
    least(99, greatest(0, coalesce((p_payload ->> 'opponent_rating')::int, 0))),
    (p_payload ->> 'tactic')::public.match_tactic, (p_payload ->> 'seed')::bigint, left(p_payload ->> 'engine_version', 20),
    'in_progress', coalesce(p_payload -> 'stats', '{}'::jsonb), v_difficulty, p_idempotency_key, false, v_opponent, v_opp_team
  ) returning id into v_match;

  perform private.audit(p_user_id, 'match_started', jsonb_build_object('match_id', v_match, 'opponent_user_id', v_opponent));
  return v_match;
end;
$$;

-- ---------------------------------------------------------- settle (full time)
create or replace function private.settle_match(p_user_id uuid, p_match uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        public.matches;
  v_home       int;
  v_away       int;
  v_result     text;
  v_coins      int := 0;
  v_xp         int := 0;
  v_rewarded   int;
  v_vs_opp     int := 0;
  v_capacity   int;
  v_limits     record;
  v_day        timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  select * into v_row from public.matches where id = p_match and user_id = p_user_id for update;
  if not found or v_row.status <> 'in_progress' then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Validate the result (the engine is trusted, but be strict anyway).
  begin
    v_home := (p_payload ->> 'home_score')::int;
    v_away := (p_payload ->> 'away_score')::int;
  exception when others then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end;
  if v_home is null or v_away is null or v_home not between 0 and 20 or v_away not between 0 and 20
     or jsonb_typeof(p_payload -> 'events') <> 'array'
     or jsonb_array_length(p_payload -> 'events') > 300 then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_payload -> 'events') e where e ->> 'type' = 'goal' and e ->> 'side' = 'home') <> v_home
     or (select count(*) from jsonb_array_elements(p_payload -> 'events') e where e ->> 'type' = 'goal' and e ->> 'side' = 'away') <> v_away then
    raise exception 'INVALID_MATCH' using errcode = '22023';
  end if;

  -- Rewards (decided here, never by the caller).
  select * into v_limits from public.match_limits();
  select count(*) into v_rewarded from public.matches
   where user_id = p_user_id and rewarded and created_at >= v_day;
  if v_row.opponent_user_id is not null then
    select count(*) into v_vs_opp from public.matches
     where user_id = p_user_id and opponent_user_id = v_row.opponent_user_id and rewarded and created_at >= v_day;
  end if;
  v_result := case when v_home > v_away then 'win' when v_home = v_away then 'draw' else 'loss' end;
  if v_rewarded < v_limits.rewarded_per_day
     and (v_row.opponent_user_id is null or v_vs_opp < (select rewarded_per_opponent from public.friendly_limits())) then
    select r.coins, r.xp into v_coins, v_xp from public.match_rewards() r where r.difficulty = v_row.difficulty and r.result = v_result;
    select capacity into v_capacity from public.stadiums where user_id = p_user_id;
    v_coins := v_coins + least(v_home * v_limits.goal_bonus, v_limits.goal_bonus_cap) + coalesce(v_capacity, 0) / 100;
  end if;

  update public.matches
     set status = 'completed', completed_at = now(), home_score = v_home, away_score = v_away,
         stats = coalesce(p_payload -> 'stats', stats), reward_coins = v_coins, xp_gained = v_xp,
         rewarded = v_coins > 0 or v_xp > 0
   where id = p_match;

  insert into public.match_events (match_id, seq, minute, event_type, side, player_name, assist_player_name, ownership_id, assist_ownership_id, detail)
  select p_match, (ord - 1)::smallint,
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
    perform private.apply_coin_transaction(p_user_id, v_coins, 'match_reward', 'match:' || p_match::text, 'match', p_match);
  end if;
  if v_xp > 0 then
    update public.profiles set xp = xp + v_xp, level = public.level_for_xp(xp + v_xp)
     where id = p_user_id;
  end if;

  perform private.audit(p_user_id, 'match_played', jsonb_build_object(
    'match_id', p_match, 'score', v_home || '-' || v_away, 'difficulty', v_row.difficulty, 'coins', v_coins, 'xp', v_xp,
    'opponent_user_id', v_row.opponent_user_id, 'decisions', jsonb_array_length(v_row.decisions)));
end;
$$;

revoke execute on function private.open_match(uuid, uuid, text, jsonb), private.settle_match(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------ public (server)
create or replace function public.start_match(p_user_id uuid, p_team_id uuid, p_idempotency_key text, p_payload jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$ select private.open_match(p_user_id, p_team_id, p_idempotency_key, p_payload) $$;

create or replace function public.record_match_decision(p_user_id uuid, p_match uuid, p_index int, p_choice text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.matches;
  v_len int;
begin
  if p_choice is null or p_choice !~ '^[a-z_]{2,20}$' then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  select * into v_row from public.matches where id = p_match and user_id = p_user_id for update;
  if not found or v_row.status <> 'in_progress' then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_len := jsonb_array_length(v_row.decisions);
  if p_index < v_len then
    -- Re-sending the same decision is harmless; changing a made decision is not allowed.
    if v_row.decisions ->> p_index = p_choice then return; end if;
    raise exception 'DECISION_ALREADY_MADE' using errcode = 'P0001';
  end if;
  if p_index <> v_len or v_len >= 10 then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  update public.matches set decisions = decisions || to_jsonb(p_choice) where id = p_match;
end;
$$;

create or replace function public.finish_match(p_user_id uuid, p_match uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  perform 1 from public.profiles where id = p_user_id for update; -- serialise with other matches
  select status into v_status from public.matches where id = p_match and user_id = p_user_id;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status = 'completed' then
    return p_match; -- already settled (idempotent)
  end if;
  perform private.settle_match(p_user_id, p_match, p_payload);
  return p_match;
end;
$$;

-- One-shot recording (classic matches and tests): same contract as before.
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
  v_match uuid;
begin
  v_match := private.open_match(p_user_id, p_team_id, p_idempotency_key, p_payload);
  if (select status from public.matches where id = v_match) = 'in_progress' then
    perform private.settle_match(p_user_id, v_match, p_payload);
  end if;
  return v_match;
end;
$$;

-- Only the server (service role) may run matches. Players cannot call any of these.
revoke execute on function public.start_match(uuid, uuid, text, jsonb), public.record_match_decision(uuid, uuid, int, text),
  public.finish_match(uuid, uuid, jsonb), public.record_match(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.start_match(uuid, uuid, text, jsonb), public.record_match_decision(uuid, uuid, int, text),
  public.finish_match(uuid, uuid, jsonb), public.record_match(uuid, uuid, text, jsonb)
  to service_role;
