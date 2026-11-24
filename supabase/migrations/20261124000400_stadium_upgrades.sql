-- =============================================================================
-- Football Legends — Phase 6: paid stadium upgrades
--
-- upgrade_stadium() is the only way a stadium level changes. One transaction:
-- lock the stadium row → check the caller's expected level → charge the next
-- level's price through apply_coin_transaction → raise the level → log it.
-- Idempotent per client key; the expected level prevents paying for a level
-- the player did not see (double submit, second tab).
-- =============================================================================

create or replace function public.upgrade_stadium(
  p_category        public.stadium_upgrade_category,
  p_expected_level  smallint,
  p_idempotency_key text
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_key     text := 'stadium:' || coalesce(p_idempotency_key, '');
  v_stadium public.stadiums;
  v_level   smallint;
  v_cost    integer;
  v_tx      public.coin_transactions;
  v_done    smallint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_category is null then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;

  -- Replay of a completed upgrade: report the level it reached.
  select su.to_level into v_done
    from public.coin_transactions ct
    join public.stadium_upgrades su on su.coin_transaction_id = ct.id
   where ct.user_id = v_uid and ct.idempotency_key = v_key;
  if found then
    return v_done;
  end if;

  select * into v_stadium from public.stadiums where user_id = v_uid for update;
  if not found then
    raise exception 'STADIUM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A concurrent request with the same key committed while we waited for the lock.
  select su.to_level into v_done
    from public.coin_transactions ct
    join public.stadium_upgrades su on su.coin_transaction_id = ct.id
   where ct.user_id = v_uid and ct.idempotency_key = v_key;
  if found then
    return v_done;
  end if;

  v_level := case p_category
    when 'seating'    then v_stadium.seating_level
    when 'lighting'   then v_stadium.lighting_level
    when 'pitch'      then v_stadium.pitch_level
    when 'facilities' then v_stadium.facilities_level
  end;
  if p_expected_level is distinct from v_level then
    raise exception 'STADIUM_LEVEL_CHANGED' using errcode = 'P0001';
  end if;
  if v_level >= 5 then
    raise exception 'STADIUM_MAX_LEVEL' using errcode = 'P0001';
  end if;

  select cost into v_cost from public.stadium_upgrade_costs where category = p_category and level = v_level + 1;
  if v_cost is null then
    raise exception 'STADIUM_MAX_LEVEL' using errcode = 'P0001';
  end if;

  v_tx := private.apply_coin_transaction(v_uid, -v_cost, 'stadium_upgrade', v_key, 'stadium', v_stadium.id);

  update public.stadiums set
    seating_level    = seating_level    + (p_category = 'seating')::int,
    lighting_level   = lighting_level   + (p_category = 'lighting')::int,
    pitch_level      = pitch_level      + (p_category = 'pitch')::int,
    facilities_level = facilities_level + (p_category = 'facilities')::int
  where id = v_stadium.id;

  insert into public.stadium_upgrades (stadium_id, user_id, category, from_level, to_level, cost, coin_transaction_id)
  values (v_stadium.id, v_uid, p_category, v_level, v_level + 1, v_cost, v_tx.id);

  perform private.audit(v_uid, 'stadium_upgraded', jsonb_build_object('category', p_category, 'to_level', v_level + 1, 'cost', v_cost));
  return v_level + 1;
end;
$$;

revoke execute on function public.upgrade_stadium(public.stadium_upgrade_category, smallint, text) from public, anon;
grant execute on function public.upgrade_stadium(public.stadium_upgrade_category, smallint, text) to authenticated;

-- The stadium page lists upgrades by user, newest first. Every other
-- per-user list already has a (user_id, created_at) index; this one didn't.
create index stadium_upgrades_user_idx on public.stadium_upgrades (user_id, created_at desc);
