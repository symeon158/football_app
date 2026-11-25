-- =============================================================================
-- Football Legends — matchday (touchline orders during interactive matches)
--
-- The server reveals a match a few minutes at a time and records how far it has
-- shown it (revealed_minute, only ever increasing). Touchline orders (tactic,
-- shout, substitution) can only be given AT the revealed minute and apply from
-- the next minute on — so nobody can look ahead and then change the past.
-- Everything remains service-role only; results are still derived by the server
-- from seed + decisions + orders and settled by finish_match.
-- =============================================================================

alter table public.matches
  add column orders jsonb not null default '[]'::jsonb
    check (jsonb_typeof(orders) = 'array' and jsonb_array_length(orders) <= 40),
  add column revealed_minute smallint not null default 0 check (revealed_minute between 0 and 90);

create or replace function public.reveal_match_minute(p_user_id uuid, p_match uuid, p_minute int)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minute smallint;
begin
  update public.matches
     set revealed_minute = greatest(revealed_minute, least(90, greatest(0, p_minute)))
   where id = p_match and user_id = p_user_id and status = 'in_progress'
  returning revealed_minute into v_minute;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_minute;
end;
$$;

create or replace function public.record_match_order(p_user_id uuid, p_match uuid, p_minute int, p_order jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.matches;
  v_kind text := p_order ->> 'kind';
begin
  select * into v_row from public.matches where id = p_match and user_id = p_user_id for update;
  if not found or v_row.status <> 'in_progress' then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Orders can only be given at the minute the manager is currently seeing.
  if p_minute is null or p_minute <> v_row.revealed_minute or p_minute >= 90 then
    raise exception 'ORDER_TOO_LATE' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_row.orders) >= 40 then
    raise exception 'TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  if not (
       (v_kind = 'tactic' and p_order ->> 'value' in ('balanced', 'attacking', 'defensive'))
    or (v_kind = 'shout' and p_order ->> 'value' in ('press', 'possession'))
    or (v_kind = 'sub' and (p_order ->> 'off') ~ '^[0-9a-f-]{36}$' and (p_order ->> 'on') ~ '^[0-9a-f-]{36}$')
  ) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  update public.matches
     set orders = orders || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'minute', p_minute, 'kind', v_kind, 'value', p_order ->> 'value', 'off', p_order ->> 'off', 'on', p_order ->> 'on')))
   where id = p_match;
end;
$$;

revoke execute on function public.reveal_match_minute(uuid, uuid, int), public.record_match_order(uuid, uuid, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.reveal_match_minute(uuid, uuid, int), public.record_match_order(uuid, uuid, int, jsonb)
  to service_role;
