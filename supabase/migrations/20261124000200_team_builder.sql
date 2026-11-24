-- =============================================================================
-- Football Legends — Phase 4: team builder
--
-- All squad changes now go through three validated RPCs, each one
-- transaction:  save_lineup · create_team · delete_team.
-- Direct client writes to team_players and to teams' lineup columns are
-- revoked, so invariants that constraints can't express (one copy of each
-- player per squad, captain in the starting XI, at least one active squad)
-- cannot be bypassed. Identity columns (name, crest, colours) stay directly
-- editable under RLS — they carry no game value.
-- =============================================================================

-- ----------------------------------------------------------------- privileges
revoke insert, update, delete on public.team_players from authenticated;
revoke insert, delete on public.teams from authenticated;
revoke update on public.teams from authenticated;
grant update (name, logo_template, primary_color, secondary_color) on public.teams to authenticated;

drop policy if exists "team_players: insert own" on public.team_players;
drop policy if exists "team_players: update own" on public.team_players;
drop policy if exists "team_players: delete own" on public.team_players;
drop policy if exists "teams: insert own" on public.teams;
drop policy if exists "teams: delete own" on public.teams;

-- ---------------------------------------------------------------- save_lineup
-- p_slots: [{"slot": 0, "ownership_id": "…"}, …]  (0–10 starters, 11–22 bench)
create or replace function public.save_lineup(
  p_team_id   uuid,
  p_formation public.formation_code,
  p_tactic    public.match_tactic,
  p_captain   uuid,
  p_slots     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_slots smallint[];
  v_ids   uuid[];
  v_n     int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Lock the team: concurrent saves of the same squad serialise.
  perform 1 from public.teams where id = p_team_id and user_id = v_uid for update;
  if not found then
    raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_formation is null or p_tactic is null
     or p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 23 then
    raise exception 'INVALID_LINEUP' using errcode = '22023';
  end if;

  begin
    select coalesce(array_agg((e ->> 'slot')::smallint order by ord), '{}'),
           coalesce(array_agg((e ->> 'ownership_id')::uuid order by ord), '{}')
      into v_slots, v_ids
      from jsonb_array_elements(p_slots) with ordinality as t(e, ord);
  exception when others then
    raise exception 'INVALID_LINEUP' using errcode = '22023';
  end;
  v_n := cardinality(v_ids);

  if array_position(v_slots, null) is not null or array_position(v_ids, null) is not null
     or exists (select 1 from unnest(v_slots) s where s not between 0 and 22)
     or (select count(distinct s) from unnest(v_slots) s) <> v_n
     or (select count(distinct i) from unnest(v_ids) i) <> v_n then
    raise exception 'INVALID_LINEUP' using errcode = '22023';
  end if;

  -- Every card must belong to the caller (checked before the FK for a clear error).
  if (select count(*) from public.card_ownership co
       where co.id = any (v_ids) and co.user_id = v_uid) <> v_n then
    raise exception 'CARD_NOT_OWNED' using errcode = '42501';
  end if;

  -- One copy of each player per squad.
  if exists (
    select pc.player_id
      from public.card_ownership co
      join public.player_cards pc on pc.id = co.card_id
     where co.id = any (v_ids)
     group by pc.player_id having count(*) > 1
  ) then
    raise exception 'DUPLICATE_PLAYER' using errcode = '23505';
  end if;

  -- Captain must be in the starting XI.
  if p_captain is not null and not exists (
    select 1 from unnest(v_slots, v_ids) as l(slot, ownership_id)
     where l.ownership_id = p_captain and l.slot <= 10
  ) then
    raise exception 'CAPTAIN_NOT_STARTER' using errcode = '23514';
  end if;

  update public.teams set captain_ownership_id = null where id = p_team_id;
  delete from public.team_players where team_id = p_team_id;
  insert into public.team_players (team_id, user_id, ownership_id, slot)
  select p_team_id, v_uid, l.ownership_id, l.slot from unnest(v_slots, v_ids) as l(slot, ownership_id);
  update public.teams
     set formation = p_formation, tactic = p_tactic, captain_ownership_id = p_captain
   where id = p_team_id;

  perform private.audit(v_uid, 'lineup_saved', jsonb_build_object(
    'team_id', p_team_id, 'formation', p_formation, 'players', v_n));
end;
$$;

-- ---------------------------------------------------------------- create_team
-- Creates a squad (max 5, enforced by trigger). Optionally copies another of
-- the caller's squads (formation, tactic, players, captain).
create or replace function public.create_team(
  p_name            text,
  p_logo_template   text default 'crest-01',
  p_primary_color   text default '#16a34a',
  p_secondary_color text default '#f8fafc',
  p_copy_from       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_src  public.teams;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_copy_from is not null then
    select * into v_src from public.teams where id = p_copy_from and user_id = v_uid;
    if not found then
      raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.teams (user_id, name, logo_template, primary_color, secondary_color, formation, tactic, is_active)
  values (v_uid, btrim(p_name), p_logo_template, p_primary_color, p_secondary_color,
          coalesce(v_src.formation, '4-3-3'), coalesce(v_src.tactic, 'balanced'),
          not exists (select 1 from public.teams where user_id = v_uid))
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.team_players (team_id, user_id, ownership_id, slot)
    select v_id, v_uid, ownership_id, slot from public.team_players where team_id = p_copy_from;
    update public.teams set captain_ownership_id = v_src.captain_ownership_id where id = v_id;
  end if;

  perform private.audit(v_uid, 'team_created', jsonb_build_object('team_id', v_id, 'copied_from', p_copy_from));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- delete_team
-- The last squad can't be deleted; deleting the active one activates the most
-- recently updated remaining squad.
create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_was_active boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- Lock all of the caller's squads so two concurrent deletes can't remove the last one.
  perform 1 from public.teams where user_id = v_uid for update;
  select is_active into v_was_active from public.teams where id = p_team_id and user_id = v_uid;
  if not found then
    raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if (select count(*) from public.teams where user_id = v_uid) <= 1 then
    raise exception 'LAST_TEAM' using errcode = 'P0001';
  end if;

  delete from public.teams where id = p_team_id;
  if v_was_active then
    update public.teams set is_active = true
     where id = (select id from public.teams where user_id = v_uid order by updated_at desc, id limit 1);
  end if;
  perform private.audit(v_uid, 'team_deleted', jsonb_build_object('team_id', p_team_id));
end;
$$;

-- Supabase's global default privileges grant EXECUTE to anon; RPCs are for
-- signed-in users only (tests/database/04 audits this).
revoke execute on function public.save_lineup(uuid, public.formation_code, public.match_tactic, uuid, jsonb) from public, anon;
revoke execute on function public.create_team(text, text, text, text, uuid) from public, anon;
revoke execute on function public.delete_team(uuid) from public, anon;
grant execute on function public.save_lineup(uuid, public.formation_code, public.match_tactic, uuid, jsonb) to authenticated;
grant execute on function public.create_team(text, text, text, text, uuid) to authenticated;
grant execute on function public.delete_team(uuid) to authenticated;
