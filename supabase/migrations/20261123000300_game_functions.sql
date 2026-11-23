-- =============================================================================
-- Football Legends — Phase 1: core server-side game functions
--
-- Conventions
--   * private.*  — internal SECURITY DEFINER helpers. Not reachable via the
--                  Data API; called by other functions / triggers / service role.
--   * public.*   — RPCs callable by signed-in users. Each one derives the user
--                  from auth.uid() (never from a parameter) and validates input.
--   * Errors     — raised with a stable UPPER_SNAKE message so the app can map
--                  them to friendly text (see web/src/lib/errors.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit helper
-- -----------------------------------------------------------------------------
create or replace function private.audit(p_user_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (user_id, action, details) values (p_user_id, p_action, p_details);
$$;

-- -----------------------------------------------------------------------------
-- The ONLY way coins move. Locks the wallet row, is idempotent per
-- (user, idempotency_key), refuses to go negative, and writes the ledger.
-- -----------------------------------------------------------------------------
create or replace function private.apply_coin_transaction(
  p_user_id         uuid,
  p_amount          bigint,
  p_type            public.coin_tx_type,
  p_idempotency_key text,
  p_reference_type  text default null,
  p_reference_id    uuid default null
)
returns public.coin_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_tx      public.coin_transactions;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Row lock serialises every balance change for this user.
  select balance into v_balance
    from public.wallets
   where user_id = p_user_id
     for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Replayed request: return the original transaction, do not charge twice.
  select * into v_tx
    from public.coin_transactions
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_tx.amount <> p_amount or v_tx.tx_type <> p_type then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_tx;
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  update public.wallets
     set balance = balance + p_amount, updated_at = now()
   where user_id = p_user_id;

  insert into public.coin_transactions
    (user_id, amount, balance_after, tx_type, reference_type, reference_id, idempotency_key)
  values
    (p_user_id, p_amount, v_balance + p_amount, p_type, p_reference_type, p_reference_id, p_idempotency_key)
  returning * into v_tx;

  return v_tx;
end;
$$;

-- The ledger is append-only. Rows may only disappear together with their
-- wallet (account deletion cascade).
create or replace function private.protect_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'LEDGER_IS_APPEND_ONLY' using errcode = '42501';
  end if;
  if exists (select 1 from public.wallets w where w.user_id = old.user_id) then
    raise exception 'LEDGER_IS_APPEND_ONLY' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger coin_transactions_append_only
  before update or delete on public.coin_transactions
  for each row execute function private.protect_ledger();

-- Wallets must always agree with the ledger: block direct balance edits that
-- do not come from apply_coin_transaction (which runs as the table owner).
-- Defence in depth on top of the missing UPDATE grant.
create or replace function private.protect_wallet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.balance is distinct from old.balance and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'WALLET_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger wallets_protect
  before update on public.wallets
  for each row execute function private.protect_wallet();

-- -----------------------------------------------------------------------------
-- Team integrity
-- -----------------------------------------------------------------------------

-- At most 5 saved squads per user.
create or replace function private.enforce_team_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.teams t where t.user_id = new.user_id) >= 5 then
    raise exception 'TEAM_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger teams_limit
  before insert on public.teams
  for each row execute function private.enforce_team_limit();

-- The captain must be one of the team's players.
create or replace function private.enforce_captain_in_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.captain_ownership_id is not null and not exists (
    select 1 from public.team_players tp
     where tp.team_id = new.id and tp.ownership_id = new.captain_ownership_id
  ) then
    raise exception 'CAPTAIN_NOT_IN_TEAM' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teams_captain_check
  before insert or update of captain_ownership_id on public.teams
  for each row execute function private.enforce_captain_in_team();

-- Removing the captain from a team clears the armband.
create or replace function private.clear_removed_captain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.teams t
     set captain_ownership_id = null
   where t.id = old.team_id
     and t.captain_ownership_id = old.ownership_id
     and (tg_op = 'DELETE' or new.ownership_id <> old.ownership_id);
  return null;
end;
$$;

create trigger team_players_clear_captain
  after delete or update of ownership_id on public.team_players
  for each row execute function private.clear_removed_captain();

-- -----------------------------------------------------------------------------
-- New account provisioning: profile, wallet (+1000 FC via the ledger),
-- stadium, a starter squad of common cards and one rare.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username  text := new.raw_user_meta_data ->> 'username';
  v_team_id   uuid;
  v_own_id    uuid;
  v_card_id   uuid;
  v_captain   uuid;
  v_best      smallint := -1;
  v_overall   smallint;
  v_slot      record;
  v_bench     smallint := 11;
  v_used      uuid[] := '{}';
begin
  if v_username is null
     or v_username !~ '^[A-Za-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles p where p.username operator(extensions.=) v_username::extensions.citext) then
    v_username := 'manager_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  begin
    insert into public.profiles (id, username, display_name)
    values (new.id, v_username, v_username);
  exception when unique_violation then
    -- Lost a race for the same username: fall back to a generated one.
    v_username := 'manager_' || substr(replace(new.id::text, '-', ''), 1, 12);
    insert into public.profiles (id, username, display_name)
    values (new.id, v_username, v_username);
  end;

  insert into public.wallets (user_id, balance) values (new.id, 0);
  perform private.apply_coin_transaction(new.id, 1000, 'signup_bonus', 'signup_bonus:' || new.id::text);

  insert into public.stadiums (user_id, name) values (new.id, v_username || ' Arena');

  insert into public.teams (user_id, name, formation, is_active)
  values (new.id, v_username || ' FC', '4-3-3', true)
  returning id into v_team_id;

  -- Starting XI: one common card per 4-3-3 position.
  for v_slot in
    select fs.slot, fs.position from public.formation_slots fs
     where fs.formation = '4-3-3' order by fs.slot
  loop
    select pc.id, pc.overall into v_card_id, v_overall
      from public.player_cards pc
     where pc.rarity = 'common' and pc.position = v_slot.position
       and pc.id <> all (v_used)
     order by random() limit 1;
    if v_card_id is null then
      select pc.id, pc.overall into v_card_id, v_overall
        from public.player_cards pc
       where pc.rarity = 'common' and pc.id <> all (v_used)
       order by random() limit 1;
    end if;
    continue when v_card_id is null;   -- empty catalogue (e.g. tests)

    v_used := v_used || v_card_id;
    insert into public.card_ownership (user_id, card_id, acquired_via)
    values (new.id, v_card_id, 'starter') returning id into v_own_id;
    insert into public.team_players (team_id, user_id, ownership_id, slot)
    values (v_team_id, new.id, v_own_id, v_slot.slot);

    if v_overall > v_best then
      v_best := v_overall; v_captain := v_own_id;
    end if;
    v_card_id := null;
  end loop;

  -- Bench: five more commons and one rare.
  for v_card_id in
    (select pc.id from public.player_cards pc
      where pc.rarity = 'common' and pc.id <> all (v_used)
      order by random() limit 5)
    union all
    (select pc.id from public.player_cards pc
      where pc.rarity = 'rare'
      order by random() limit 1)
  loop
    insert into public.card_ownership (user_id, card_id, acquired_via)
    values (new.id, v_card_id, 'starter') returning id into v_own_id;
    insert into public.team_players (team_id, user_id, ownership_id, slot)
    values (v_team_id, new.id, v_own_id, v_bench);
    v_bench := v_bench + 1;
  end loop;

  if v_captain is not null then
    update public.teams set captain_ownership_id = v_captain where id = v_team_id;
  end if;

  perform private.audit(new.id, 'account_provisioned',
    jsonb_build_object('username', v_username, 'starter_cards', v_bench - 11 + coalesce(array_length(v_used, 1), 0)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Public RPCs
-- -----------------------------------------------------------------------------

-- Used by the sign-up form. Usernames are public (leaderboards), so this
-- reveals nothing private.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles p where p.username operator(extensions.=) p_username::extensions.citext);
$$;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Switch which saved squad is the active one.
create or replace function public.set_active_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id and user_id = v_uid) then
    raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.teams set is_active = false where user_id = v_uid and is_active and id <> p_team_id;
  update public.teams set is_active = true  where id = p_team_id;
end;
$$;
grant execute on function public.set_active_team(uuid) to authenticated;
