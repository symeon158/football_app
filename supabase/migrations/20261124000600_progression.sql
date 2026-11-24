-- =============================================================================
-- Football Legends — Phase 8: challenges, achievements, leaderboards, profiles
--
-- Progress is DERIVED from authoritative data (matches, cards, stadium,
-- profile, squads) at read time — there are no counters to drift or game.
-- Rewards are claimed through security-definer RPCs that verify completion
-- and pay through the ledger with a deterministic key (once per period).
-- =============================================================================

-- --------------------------------------------- team rating/chemistry in SQL
-- Mirrors web/src/lib/game/team-rating.ts and lineup.ts (parity-tested).
create table private.related_positions (slot_position public.player_position, card_position public.player_position, primary key (slot_position, card_position));
insert into private.related_positions values
  ('CB','CDM'), ('LB','LM'), ('LB','CB'), ('RB','RM'), ('RB','CB'), ('CDM','CM'), ('CDM','CB'),
  ('CM','CDM'), ('CM','CAM'), ('CAM','CM'), ('CAM','ST'), ('LM','LW'), ('LM','LB'), ('LM','CM'),
  ('RM','RW'), ('RM','RB'), ('RM','CM'), ('LW','LM'), ('LW','ST'), ('RW','RM'), ('RW','ST'),
  ('ST','CAM'), ('ST','LW'), ('ST','RW');

create or replace function private.effective_rating(p_slot public.player_position, p_card public.player_position, p_overall int)
returns int language sql stable set search_path = ''
as $$
  select case
    when p_slot = p_card then p_overall
    when p_slot = 'GK' or p_card = 'GK' then round(p_overall * 0.3)::int
    when exists (select 1 from private.related_positions r where r.slot_position = p_slot and r.card_position = p_card) then round(p_overall * 0.9)::int
    else round(p_overall * 0.75)::int
  end;
$$;

create or replace function private.position_fit(p_slot public.player_position, p_card public.player_position)
returns int language sql stable set search_path = ''
as $$
  select case
    when p_slot = p_card then 4
    when exists (select 1 from private.related_positions r where r.slot_position = p_slot and r.card_position = p_card) then 2
    else 0
  end;
$$;

alter table public.teams
  add column overall_cached smallint not null default 0 check (overall_cached between 0 and 99),
  add column chemistry_cached smallint not null default 0 check (chemistry_cached between 0 and 100);

create or replace function private.refresh_team_metrics(p_team_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_overall int;
  v_chem int;
begin
  with starters as (
    select tp.ownership_id, fs.position as slot_position, pc.position as card_position, pc.overall, pl.club, pl.nationality
      from public.team_players tp
      join public.teams t on t.id = tp.team_id
      join public.formation_slots fs on fs.formation = t.formation and fs.slot = tp.slot
      join public.card_ownership co on co.id = tp.ownership_id
      join public.player_cards pc on pc.id = co.card_id
      join public.players pl on pl.id = pc.player_id
     where tp.team_id = p_team_id and tp.slot <= 10
  ), scored as (
    select s.*,
           private.effective_rating(s.slot_position, s.card_position, s.overall) as eff,
           private.position_fit(s.slot_position, s.card_position) as fit,
           (select count(*) from starters o where o.ownership_id <> s.ownership_id and o.club = s.club) as club_links,
           (select count(*) from starters o where o.ownership_id <> s.ownership_id and o.nationality = s.nationality) as nation_links
      from starters s
  )
  select coalesce(round(sum(eff) / 11.0), 0)::int,
         coalesce(round(sum(fit + case when club_links >= 2 then 3 when club_links = 1 then 2 else 0 end + least(3, nation_links)) / 110.0 * 100), 0)::int
    into v_overall, v_chem
    from scored;
  update public.teams set overall_cached = v_overall, chemistry_cached = v_chem where id = p_team_id;
end;
$$;

-- Keep the cache in sync with every line-up change (statement-level, per event).
create or replace function private.team_players_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare t uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    for t in select distinct team_id from new_rows loop perform private.refresh_team_metrics(t); end loop;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    for t in select distinct team_id from old_rows where exists (select 1 from public.teams x where x.id = old_rows.team_id) loop
      perform private.refresh_team_metrics(t);
    end loop;
  end if;
  return null;
end;
$$;
create trigger team_players_metrics_ins after insert on public.team_players referencing new table as new_rows
  for each statement execute function private.team_players_changed();
create trigger team_players_metrics_del after delete on public.team_players referencing old table as old_rows
  for each statement execute function private.team_players_changed();
create trigger team_players_metrics_upd after update on public.team_players referencing new table as new_rows old table as old_rows
  for each statement execute function private.team_players_changed();

create or replace function private.teams_formation_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.refresh_team_metrics(new.id); return null; end; $$;
create trigger teams_metrics_formation after update of formation on public.teams
  for each row execute function private.teams_formation_changed();

-- Backfill existing squads.
select private.refresh_team_metrics(id) from public.teams;

-- ----------------------------------------------------------------- metrics
create or replace function private.period_bounds(p_period public.challenge_period, p_now timestamptz default now())
returns table (period_start date, from_ts timestamptz, to_ts timestamptz)
language sql stable set search_path = ''
as $$
  select case p_period
           when 'daily'  then (p_now at time zone 'utc')::date
           when 'weekly' then date_trunc('week', p_now at time zone 'utc')::date
           else date '1970-01-01' end,
         case p_period
           when 'daily'  then date_trunc('day',  p_now at time zone 'utc') at time zone 'utc'
           when 'weekly' then date_trunc('week', p_now at time zone 'utc') at time zone 'utc'
           else '-infinity'::timestamptz end,
         case p_period
           when 'daily'  then (date_trunc('day',  p_now at time zone 'utc') + interval '1 day')  at time zone 'utc'
           when 'weekly' then (date_trunc('week', p_now at time zone 'utc') + interval '7 days') at time zone 'utc'
           else 'infinity'::timestamptz end;
$$;

-- A player's value for a metric within [from, to). Card/stadium/level/team
-- metrics are current state; match metrics count completed matches in range.
create or replace function private.metric_value(p_user uuid, p_metric text, p_from timestamptz, p_to timestamptz)
returns int language plpgsql stable security definer set search_path = ''
as $$
begin
  return case p_metric
    when 'matches_played' then (select count(*) from public.matches m where m.user_id = p_user and m.status = 'completed' and m.created_at >= p_from and m.created_at < p_to)
    when 'matches_won'    then (select count(*) from public.matches m where m.user_id = p_user and m.status = 'completed' and m.home_score > m.away_score and m.created_at >= p_from and m.created_at < p_to)
    when 'goals_scored'   then (select coalesce(sum(m.home_score), 0) from public.matches m where m.user_id = p_user and m.status = 'completed' and m.created_at >= p_from and m.created_at < p_to)
    when 'clean_sheets'   then (select count(*) from public.matches m where m.user_id = p_user and m.status = 'completed' and m.away_score = 0 and m.created_at >= p_from and m.created_at < p_to)
    when 'cards_owned'    then (select count(*) from public.card_ownership co where co.user_id = p_user)
    when 'rare_cards_owned' then (select count(*) from public.card_ownership co join public.player_cards pc on pc.id = co.card_id where co.user_id = p_user and public.rarity_rank(pc.rarity) >= public.rarity_rank('rare'))
    when 'legendary_cards_owned' then (select count(*) from public.card_ownership co join public.player_cards pc on pc.id = co.card_id where co.user_id = p_user and public.rarity_rank(pc.rarity) >= public.rarity_rank('legendary'))
    when 'stadium_level'  then (select coalesce(max(s.stadium_level), 0) from public.stadiums s where s.user_id = p_user)
    when 'user_level'     then (select p.level from public.profiles p where p.id = p_user)
    when 'team_overall'   then (select coalesce(max(t.overall_cached), 0) from public.teams t where t.user_id = p_user)
    when 'team_chemistry' then (select coalesce(max(t.chemistry_cached), 0) from public.teams t where t.user_id = p_user)
    else 0
  end;
end;
$$;

-- Shared payout: coins via the ledger (idempotent per key) + XP/level.
create or replace function private.award(p_user uuid, p_coins int, p_xp int, p_type public.coin_tx_type, p_key text, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_coins > 0 then
    perform private.apply_coin_transaction(p_user, p_coins, p_type, p_key, p_ref_type, p_ref_id);
  end if;
  if p_xp > 0 then
    update public.profiles set xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) where id = p_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------- challenges
create or replace function public.get_challenges()
returns table (id uuid, code text, title text, description text, period public.challenge_period, metric text,
               target int, reward_coins int, reward_xp int, progress int, completed boolean, claimed boolean,
               period_start date, period_end timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  return query
  select c.id, c.code, c.title, c.description, c.period, c.metric, c.target, c.reward_coins, c.reward_xp,
         least(v.val, c.target), v.val >= c.target,
         exists (select 1 from public.user_challenges uc where uc.user_id = v_uid and uc.challenge_id = c.id and uc.period_start = b.period_start and uc.claimed_at is not null),
         b.period_start, nullif(b.to_ts, 'infinity'::timestamptz)
    from public.challenges c
    cross join lateral private.period_bounds(c.period) b
    cross join lateral (select private.metric_value(v_uid, c.metric, b.from_ts, b.to_ts) as val) v
   where c.is_active
   order by array_position(array['daily','weekly','team_building','milestone']::text[], c.period::text), c.reward_coins;
end;
$$;

create or replace function public.claim_challenge(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.challenges;
  v_b   record;
  v_val int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_uid for update;  -- serialise claims per user
  select * into v_c from public.challenges where id = p_challenge_id and is_active;
  if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_b from private.period_bounds(v_c.period);
  if exists (select 1 from public.user_challenges where user_id = v_uid and challenge_id = v_c.id and period_start = v_b.period_start and claimed_at is not null) then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;
  v_val := private.metric_value(v_uid, v_c.metric, v_b.from_ts, v_b.to_ts);
  if v_val < v_c.target then raise exception 'NOT_COMPLETED' using errcode = 'P0001'; end if;

  insert into public.user_challenges (user_id, challenge_id, period_start, progress, completed_at, claimed_at)
  values (v_uid, v_c.id, v_b.period_start, least(v_val, v_c.target), now(), now())
  on conflict (user_id, challenge_id, period_start) do update set progress = excluded.progress, completed_at = coalesce(public.user_challenges.completed_at, now()), claimed_at = now();

  perform private.award(v_uid, v_c.reward_coins, v_c.reward_xp, 'challenge_reward',
                        'challenge:' || v_c.id || ':' || v_b.period_start, 'challenge', v_c.id);
  perform private.audit(v_uid, 'challenge_claimed', jsonb_build_object('challenge', v_c.code, 'period', v_b.period_start));
  return jsonb_build_object('coins', v_c.reward_coins, 'xp', v_c.reward_xp, 'level', (select level from public.profiles where id = v_uid));
end;
$$;

-- -------------------------------------------------------------- achievements
create or replace function public.get_achievements()
returns table (id uuid, code text, title text, description text, badge_icon text, metric text, target int,
               reward_coins int, reward_xp int, progress int, unlocked boolean, claimed boolean, claimed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  return query
  select a.id, a.code, a.title, a.description, a.badge_icon, a.metric, a.target, a.reward_coins, a.reward_xp,
         least(v.val, a.target), v.val >= a.target or ua.user_id is not null, ua.claimed_at is not null, ua.claimed_at
    from public.achievements a
    cross join lateral (select private.metric_value(v_uid, a.metric, '-infinity', 'infinity') as val) v
    left join public.user_achievements ua on ua.user_id = v_uid and ua.achievement_id = a.id
   order by (ua.claimed_at is not null), a.target, a.title;
end;
$$;

create or replace function public.claim_achievement(p_achievement_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a   public.achievements;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  select * into v_a from public.achievements where id = p_achievement_id;
  if not found then raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.user_achievements where user_id = v_uid and achievement_id = v_a.id and claimed_at is not null) then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;
  if private.metric_value(v_uid, v_a.metric, '-infinity', 'infinity') < v_a.target then
    raise exception 'NOT_COMPLETED' using errcode = 'P0001';
  end if;
  insert into public.user_achievements (user_id, achievement_id, unlocked_at, claimed_at)
  values (v_uid, v_a.id, now(), now())
  on conflict (user_id, achievement_id) do update set claimed_at = now();
  perform private.award(v_uid, v_a.reward_coins, v_a.reward_xp, 'achievement_reward', 'achievement:' || v_a.id, 'achievement', v_a.id);
  perform private.audit(v_uid, 'achievement_claimed', jsonb_build_object('achievement', v_a.code));
  return jsonb_build_object('coins', v_a.reward_coins, 'xp', v_a.reward_xp, 'level', (select level from public.profiles where id = v_uid));
end;
$$;

-- -------------------------------------------------------------- leaderboards
-- Public game identity only (username, display name, avatar, level, score).
create or replace function public.get_leaderboard(p_board text, p_period text default 'all', p_limit int default 50)
returns table (rank bigint, username text, display_name text, avatar_key text, level int, value bigint, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from timestamptz := case when p_period = 'week' then date_trunc('week', now() at time zone 'utc') at time zone 'utc' else '-infinity'::timestamptz end;
  v_lim  int := least(100, greatest(1, coalesce(p_limit, 50)));
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_board not in ('level', 'wins', 'goals', 'team_rating', 'club_value') or p_period not in ('all', 'week') then
    raise exception 'INVALID_LEADERBOARD' using errcode = '22023';
  end if;
  return query
  with scores as (
    select p.id, p.username::text as username, p.display_name, p.avatar_key, p.level, p.created_at,
      case p_board
        when 'level' then p.xp
        when 'wins'  then (select count(*) from public.matches m where m.user_id = p.id and m.status = 'completed' and m.home_score > m.away_score and m.created_at >= v_from)
        when 'goals' then (select coalesce(sum(m.home_score), 0) from public.matches m where m.user_id = p.id and m.status = 'completed' and m.created_at >= v_from)
        when 'team_rating' then (select coalesce(max(t.overall_cached), 0) from public.teams t where t.user_id = p.id)
        when 'club_value'  then (select coalesce(sum(pc.market_price), 0) from public.card_ownership co join public.player_cards pc on pc.id = co.card_id where co.user_id = p.id)
      end::bigint as val
      from public.profiles p
  ), ranked as (
    select s.*, rank() over (order by s.val desc) as rnk from scores s where s.val > 0 or s.id = v_uid
  )
  select r.rnk, r.username, r.display_name, r.avatar_key, r.level, r.val, r.id = v_uid
    from ranked r
   where r.rnk <= v_lim or r.id = v_uid
   order by r.rnk, r.created_at;
end;
$$;

-- ------------------------------------------------------------ public profile
-- Safe, game-only view of any manager (no e-mail or other private data).
create or replace function public.get_manager_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p   public.profiles;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_p from public.profiles where username operator(extensions.=) p_username::extensions.citext;
  if not found then return null; end if;
  return jsonb_build_object(
    'username', v_p.username::text, 'display_name', v_p.display_name, 'avatar_key', v_p.avatar_key,
    'level', v_p.level, 'xp', v_p.xp, 'member_since', v_p.created_at, 'is_me', v_p.id = v_uid,
    'played', (select count(*) from public.matches m where m.user_id = v_p.id and m.status = 'completed'),
    'won',    (select count(*) from public.matches m where m.user_id = v_p.id and m.status = 'completed' and m.home_score > m.away_score),
    'drawn',  (select count(*) from public.matches m where m.user_id = v_p.id and m.status = 'completed' and m.home_score = m.away_score),
    'lost',   (select count(*) from public.matches m where m.user_id = v_p.id and m.status = 'completed' and m.home_score < m.away_score),
    'goals',  (select coalesce(sum(m.home_score), 0) from public.matches m where m.user_id = v_p.id and m.status = 'completed'),
    'cards',  (select count(*) from public.card_ownership co where co.user_id = v_p.id),
    'club_value', (select coalesce(sum(pc.market_price), 0) from public.card_ownership co join public.player_cards pc on pc.id = co.card_id where co.user_id = v_p.id),
    'best_team_rating', (select coalesce(max(t.overall_cached), 0) from public.teams t where t.user_id = v_p.id),
    'team', (select jsonb_build_object('name', t.name, 'logo_template', t.logo_template, 'primary_color', t.primary_color, 'secondary_color', t.secondary_color, 'overall', t.overall_cached, 'formation', t.formation)
               from public.teams t where t.user_id = v_p.id and t.is_active),
    'stadium', (select jsonb_build_object('name', s.name, 'level', s.stadium_level, 'capacity', s.capacity, 'design', s.design_template) from public.stadiums s where s.user_id = v_p.id),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'title', a.title, 'badge_icon', a.badge_icon, 'claimed_at', ua.claimed_at) order by ua.claimed_at), '[]'::jsonb)
                 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
                where ua.user_id = v_p.id and ua.claimed_at is not null)
  );
end;
$$;

-- ----------------------------------------------------------------- privileges
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_challenges() from public, anon;
revoke execute on function public.claim_challenge(uuid) from public, anon;
revoke execute on function public.get_achievements() from public, anon;
revoke execute on function public.claim_achievement(uuid) from public, anon;
revoke execute on function public.get_leaderboard(text, text, int) from public, anon;
revoke execute on function public.get_manager_profile(text) from public, anon;
grant execute on function public.get_challenges(), public.claim_challenge(uuid), public.get_achievements(),
  public.claim_achievement(uuid), public.get_leaderboard(text, text, int), public.get_manager_profile(text) to authenticated;
