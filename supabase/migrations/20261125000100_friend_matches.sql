-- =============================================================================
-- Football Legends — friend matches
--
-- A manager can challenge another manager's ACTIVE squad. The opponent does not
-- need to be online: the server simulates the match exactly like an AI match
-- (challenger at home) and records it with record_match(), which still only the
-- service role can execute. The opponent can read matches played against them.
--
-- Rewards: "normal" difficulty, from the same daily allowance as AI matches,
-- and at most friendly_limits().rewarded_per_opponent paid matches per opponent
-- per UTC day, so two accounts cannot farm coins off each other.
-- =============================================================================

alter table public.matches
  add column opponent_user_id uuid references public.profiles (id) on delete set null,
  add column opponent_team_id uuid references public.teams (id) on delete set null,
  add constraint matches_not_self check (opponent_user_id is null or opponent_user_id <> user_id);

create index matches_opponent_idx on public.matches (opponent_user_id, created_at desc)
  where opponent_user_id is not null;
create index matches_user_opponent_day_idx on public.matches (user_id, opponent_user_id, created_at)
  where opponent_user_id is not null;

-- The opponent can read matches played against their club (and their timelines).
create policy "matches: read as opponent" on public.matches
  for select to authenticated using (opponent_user_id = (select auth.uid()));
create policy "match_events: read as opponent" on public.match_events
  for select to authenticated using (
    exists (select 1 from public.matches m
            where m.id = match_events.match_id and m.opponent_user_id = (select auth.uid()))
  );

-- ------------------------------------------------------------------- limits
create or replace function public.friendly_limits()
returns table (rewarded_per_opponent integer)
language sql immutable set search_path = ''
as $$ select 5 $$;
revoke execute on function public.friendly_limits() from public, anon;
grant execute on function public.friendly_limits() to authenticated;

-- ----------------------------------------------------------------- scouting
-- What a challenger may see before kick-off: the opponent's public profile, their
-- active squad (formation, tactic, line-up with public card stats) and the
-- head-to-head record. Never e-mail, coins or anything private.
create or replace function public.get_friendly_opponent(p_username text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_p    public.profiles;
  v_team public.teams;
  v_from timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_p from public.profiles where username operator(extensions.=) p_username::extensions.citext;
  if not found then return null; end if;
  if v_p.id = v_uid then raise exception 'CANNOT_CHALLENGE_SELF' using errcode = '22023'; end if;
  select * into v_team from public.teams where user_id = v_p.id and is_active;

  return jsonb_build_object(
    'user_id', v_p.id, 'username', v_p.username::text, 'display_name', v_p.display_name, 'level', v_p.level,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'logo_template', v_team.logo_template,
      'primary_color', v_team.primary_color, 'secondary_color', v_team.secondary_color,
      'formation', v_team.formation, 'tactic', v_team.tactic, 'captain_ownership_id', v_team.captain_ownership_id,
      'overall', v_team.overall_cached, 'chemistry', v_team.chemistry_cached) end,
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
        'slot', tp.slot, 'ownership_id', tp.ownership_id, 'player_id', c.player_id,
        'display_name', c.display_name, 'first_name', c.first_name, 'last_name', c.last_name, 'known_as', c.known_as,
        'position', c.position, 'overall', c.overall, 'rarity', c.rarity, 'nationality', c.nationality, 'club', c.club,
        'pace', c.pace, 'shooting', c.shooting, 'passing', c.passing, 'dribbling', c.dribbling,
        'defending', c.defending, 'physicality', c.physicality) order by tp.slot), '[]'::jsonb)
      from public.team_players tp
      join public.card_ownership co on co.id = tp.ownership_id
      join public.card_catalog c on c.card_id = co.card_id
     where tp.team_id = v_team.id),
    -- Head-to-head from the viewer's point of view (both directions).
    'h2h', (select jsonb_build_object(
        'won',   count(*) filter (where (m.user_id = v_uid and m.home_score > m.away_score) or (m.user_id = v_p.id and m.away_score > m.home_score)),
        'drawn', count(*) filter (where m.home_score = m.away_score),
        'lost',  count(*) filter (where (m.user_id = v_uid and m.home_score < m.away_score) or (m.user_id = v_p.id and m.away_score < m.home_score)))
      from public.matches m
     where m.status = 'completed'
       and ((m.user_id = v_uid and m.opponent_user_id = v_p.id) or (m.user_id = v_p.id and m.opponent_user_id = v_uid))),
    'rewarded_today', (select count(*) from public.matches m
                        where m.user_id = v_uid and m.opponent_user_id = v_p.id and m.rewarded and m.created_at >= v_from)
  );
end;
$$;
revoke execute on function public.get_friendly_opponent(text) from public, anon;
grant execute on function public.get_friendly_opponent(text) to authenticated;

-- ------------------------------------------------------------- record_match
-- Same as before, plus optional payload keys opponent_user_id / opponent_team_id.
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
  v_opponent   uuid;
  v_opp_team   uuid;
  v_vs_opp     int := 0;
  v_day        timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
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
    v_opponent := nullif(p_payload ->> 'opponent_user_id', '')::uuid;
    v_opp_team := nullif(p_payload ->> 'opponent_team_id', '')::uuid;
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
    select count(*) into v_vs_opp from public.matches
     where user_id = p_user_id and opponent_user_id = v_opponent and rewarded and created_at >= v_day;
  end if;

  select * into v_limits from public.match_limits();
  select max(created_at) into v_last from public.matches where user_id = p_user_id;
  if v_last is not null and v_last > now() - make_interval(secs => v_limits.cooldown_seconds) then
    raise exception 'MATCH_COOLDOWN' using errcode = 'P0001';
  end if;
  select count(*), count(*) filter (where rewarded) into v_today, v_rewarded
    from public.matches
   where user_id = p_user_id and created_at >= v_day;
  if v_today >= v_limits.max_per_day then
    raise exception 'MATCH_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  -- Rewards (decided here, never by the caller).
  v_result := case when v_home > v_away then 'win' when v_home = v_away then 'draw' else 'loss' end;
  if v_rewarded < v_limits.rewarded_per_day
     and (v_opponent is null or v_vs_opp < (select rewarded_per_opponent from public.friendly_limits())) then
    select r.coins, r.xp into v_coins, v_xp from public.match_rewards() r where r.difficulty = v_difficulty and r.result = v_result;
    select capacity into v_capacity from public.stadiums where user_id = p_user_id;
    v_coins := v_coins + least(v_home * v_limits.goal_bonus, v_limits.goal_bonus_cap) + coalesce(v_capacity, 0) / 100;
  end if;

  insert into public.matches (
    user_id, team_id, team_snapshot, opponent_name, opponent_rating, tactic, seed, engine_version,
    status, home_score, away_score, stats, reward_coins, xp_gained, completed_at, difficulty,
    idempotency_key, rewarded, opponent_user_id, opponent_team_id
  ) values (
    p_user_id, p_team_id, coalesce(p_payload -> 'team_snapshot', '{}'::jsonb),
    left(coalesce(p_payload ->> 'opponent_name', 'Opponent'), 60),
    least(99, greatest(0, coalesce((p_payload ->> 'opponent_rating')::int, 0))),
    (p_payload ->> 'tactic')::public.match_tactic, (p_payload ->> 'seed')::bigint, left(p_payload ->> 'engine_version', 20),
    'completed', v_home, v_away, coalesce(p_payload -> 'stats', '{}'::jsonb), v_coins, v_xp, now(), v_difficulty,
    p_idempotency_key, v_coins > 0 or v_xp > 0, v_opponent, v_opp_team
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
    'match_id', v_match, 'score', v_home || '-' || v_away, 'difficulty', v_difficulty, 'coins', v_coins, 'xp', v_xp,
    'opponent_user_id', v_opponent));
  return v_match;
end;
$$;
revoke execute on function public.record_match(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_match(uuid, uuid, text, jsonb) to service_role;

-- ------------------------------------------------------------ account deletion
-- When an opponent deletes their account, other managers keep their match but it
-- no longer names or links the deleted club. Runs inside the auth admin's cascade,
-- hence SECURITY DEFINER.
create or replace function private.forget_deleted_opponent()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.matches
     set opponent_name = 'Deleted club', opponent_user_id = null, opponent_team_id = null
   where opponent_user_id = old.id;
  return old;
end;
$$;
revoke execute on function private.forget_deleted_opponent() from public, anon, authenticated;

create trigger profiles_forget_opponent
  before delete on public.profiles
  for each row execute function private.forget_deleted_opponent();
