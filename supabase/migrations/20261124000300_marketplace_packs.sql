-- =============================================================================
-- Football Legends — Phase 5: marketplace and card packs
--
-- Coins only move through private.apply_coin_transaction (Phase 1). The two
-- RPCs here charge and grant inside ONE transaction, are idempotent per
-- client-supplied key, and record what was bought for the audit trail.
-- Pack odds live in a table that is both published to players and read by the
-- draw function, so the displayed odds are exactly the odds used.
-- No real-money purchases exist anywhere: coins are earned through play.
-- =============================================================================

-- ------------------------------------------------------------------ packs
create table public.card_packs (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[a-z0-9_]{3,40}$'),
  name              text not null,
  description       text not null,
  price             integer not null check (price > 0),
  cards_per_pack    smallint not null check (cards_per_pack between 1 and 10),
  guaranteed_rarity public.card_rarity,          -- at least one card of this rarity or better
  daily_limit       smallint not null default 5 check (daily_limit between 1 and 50),
  sort_order        smallint not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Probability of each rarity per card, in basis points (1/100 of a percent).
create table public.card_pack_odds (
  pack_id  uuid not null references public.card_packs (id) on delete cascade,
  rarity   public.card_rarity not null,
  weight   integer not null check (weight between 0 and 10000),
  primary key (pack_id, rarity)
);

-- Rarity order for comparisons (enum order is common < rare < … < icon).
create or replace function public.rarity_rank(p public.card_rarity)
returns smallint language sql immutable parallel safe set search_path = ''
as $$ select (array_position(enum_range(null::public.card_rarity), p) - 1)::smallint $$;
revoke execute on function public.rarity_rank(public.card_rarity) from public, anon;
grant execute on function public.rarity_rank(public.card_rarity) to authenticated;

-- ------------------------------------------------------------ purchases log
create table public.pack_openings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  pack_id             uuid not null references public.card_packs (id),
  coin_transaction_id bigint not null unique references public.coin_transactions (id),
  price_paid          integer not null check (price_paid > 0),
  created_at          timestamptz not null default now()
);
create index pack_openings_user_idx on public.pack_openings (user_id, created_at desc);

alter table public.card_ownership
  add column coin_transaction_id bigint unique references public.coin_transactions (id),
  add column pack_opening_id uuid references public.pack_openings (id) on delete set null,
  add column pack_position smallint check (pack_position between 0 and 9),
  add constraint card_ownership_pack_slot_unique unique (pack_opening_id, pack_position);
create index card_ownership_pack_idx on public.card_ownership (pack_opening_id) where pack_opening_id is not null;

-- ---------------------------------------------------------------------- RLS
alter table public.card_packs     enable row level security;
alter table public.card_pack_odds enable row level security;
alter table public.pack_openings  enable row level security;

grant select on public.card_packs, public.card_pack_odds, public.pack_openings to authenticated;
create policy "catalogue: authenticated read" on public.card_packs for select to authenticated using (is_active);
create policy "catalogue: authenticated read" on public.card_pack_odds for select to authenticated using (true);
create policy "pack_openings: read own" on public.pack_openings for select to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------------------- draw helper
-- Picks a rarity using the pack's published weights, restricted to rarities
-- >= p_min (renormalised). Internal: callable only by other functions.
create or replace function private.draw_rarity(p_pack_id uuid, p_min public.card_rarity default 'common')
returns public.card_rarity
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_roll  double precision;
  v_acc   integer := 0;
  r       record;
begin
  select sum(weight) into v_total from public.card_pack_odds
   where pack_id = p_pack_id and public.rarity_rank(rarity) >= public.rarity_rank(p_min);
  if coalesce(v_total, 0) <= 0 then
    raise exception 'PACK_MISCONFIGURED' using errcode = 'P0001';
  end if;
  v_roll := random() * v_total;
  for r in
    select rarity, weight from public.card_pack_odds
     where pack_id = p_pack_id and weight > 0 and public.rarity_rank(rarity) >= public.rarity_rank(p_min)
     order by public.rarity_rank(rarity)
  loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then
      return r.rarity;
    end if;
  end loop;
  return r.rarity; -- floating-point edge: last bucket
end;
$$;
revoke execute on function private.draw_rarity(uuid, public.card_rarity) from public, anon, authenticated;

-- ------------------------------------------------------------------ buy_card
create or replace function public.buy_card(p_card_id uuid, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_card  public.player_cards;
  v_key   text := 'buy:' || coalesce(p_idempotency_key, '');
  v_tx    public.coin_transactions;
  v_own   uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Replay of an already completed purchase: return the original card.
  select co.id into v_own
    from public.coin_transactions ct
    join public.card_ownership co on co.coin_transaction_id = ct.id
   where ct.user_id = v_uid and ct.idempotency_key = v_key;
  if found then
    return v_own;
  end if;

  select * into v_card from public.player_cards where id = p_card_id;
  if not found or not v_card.is_purchasable then
    raise exception 'CARD_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if (select count(*) from public.card_ownership where user_id = v_uid) >= 500 then
    raise exception 'COLLECTION_FULL' using errcode = 'P0001';
  end if;

  -- Charges (or raises INSUFFICIENT_FUNDS); serialised on the wallet row lock.
  v_tx := private.apply_coin_transaction(v_uid, -v_card.market_price, 'card_purchase', v_key, 'player_card', v_card.id);

  begin
    insert into public.card_ownership (user_id, card_id, acquired_via, coin_transaction_id)
    values (v_uid, v_card.id, 'market', v_tx.id)
    returning id into v_own;
  exception when unique_violation then
    -- A concurrent request with the same key won the race; it already granted the card.
    select id into v_own from public.card_ownership where coin_transaction_id = v_tx.id;
  end;

  perform private.audit(v_uid, 'card_bought', jsonb_build_object('card_id', v_card.id, 'price', v_card.market_price, 'ownership_id', v_own));
  return v_own;
end;
$$;

-- ----------------------------------------------------------------- open_pack
create or replace function public.open_pack(p_pack_id uuid, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_pack    public.card_packs;
  v_key     text := 'pack:' || coalesce(p_idempotency_key, '');
  v_tx      public.coin_transactions;
  v_opening uuid;
  v_rarity  public.card_rarity;
  v_card    uuid;
  v_today   int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Replay: return the original opening.
  select po.id into v_opening
    from public.coin_transactions ct
    join public.pack_openings po on po.coin_transaction_id = ct.id
   where ct.user_id = v_uid and ct.idempotency_key = v_key;
  if found then
    return v_opening;
  end if;

  select * into v_pack from public.card_packs where id = p_pack_id and is_active;
  if not found then
    raise exception 'PACK_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  -- Lock the wallet first so the daily-limit count and the charge are atomic.
  perform 1 from public.wallets where user_id = v_uid for update;
  select count(*) into v_today from public.pack_openings
   where user_id = v_uid and pack_id = p_pack_id and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_today >= v_pack.daily_limit then
    raise exception 'PACK_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.card_ownership where user_id = v_uid) + v_pack.cards_per_pack > 500 then
    raise exception 'COLLECTION_FULL' using errcode = 'P0001';
  end if;

  v_tx := private.apply_coin_transaction(v_uid, -v_pack.price, 'pack_purchase', v_key, 'card_pack', v_pack.id);

  -- A concurrent request with the same key committed while we waited for the
  -- wallet lock: apply_coin_transaction returned its charge; return its opening.
  select id into v_opening from public.pack_openings where coin_transaction_id = v_tx.id;
  if found then
    return v_opening;
  end if;

  insert into public.pack_openings (user_id, pack_id, coin_transaction_id, price_paid)
  values (v_uid, v_pack.id, v_tx.id, v_pack.price)
  returning id into v_opening;

  for i in 0 .. v_pack.cards_per_pack - 1 loop
    -- The first card honours the pack's guarantee; the rest use the plain odds.
    v_rarity := private.draw_rarity(v_pack.id, case when i = 0 then coalesce(v_pack.guaranteed_rarity, 'common') else 'common' end);
    select id into v_card from public.player_cards where rarity = v_rarity order by random() limit 1;
    if v_card is null then
      raise exception 'PACK_MISCONFIGURED' using errcode = 'P0001';
    end if;
    insert into public.card_ownership (user_id, card_id, acquired_via, pack_opening_id, pack_position)
    values (v_uid, v_card, 'pack', v_opening, i);
  end loop;

  perform private.audit(v_uid, 'pack_opened', jsonb_build_object('pack', v_pack.code, 'opening_id', v_opening, 'price', v_pack.price));
  return v_opening;
end;
$$;

revoke execute on function public.buy_card(uuid, text) from public, anon;
revoke execute on function public.open_pack(uuid, text) from public, anon;
grant execute on function public.buy_card(uuid, text) to authenticated;
grant execute on function public.open_pack(uuid, text) to authenticated;

-- ------------------------------------------------------------- pack catalogue
with p as (
  insert into public.card_packs (code, name, description, price, cards_per_pack, guaranteed_rarity, daily_limit, sort_order) values
    ('bronze', 'Bronze Pack', 'Three cards to fill out your squad.', 400, 3, null, 10, 1),
    ('silver', 'Silver Pack', 'Four cards with at least one Rare.', 1200, 4, 'rare', 5, 2),
    ('gold',   'Gold Pack',   'Five cards with at least one Epic and a shot at Legends.', 3500, 5, 'epic', 3, 3)
  returning id, code
)
insert into public.card_pack_odds (pack_id, rarity, weight)
select p.id, o.rarity::public.card_rarity, o.weight
  from p
  join (values
    ('bronze', 'common', 8000), ('bronze', 'rare', 1800), ('bronze', 'epic', 200),  ('bronze', 'legendary', 0),   ('bronze', 'icon', 0),
    ('silver', 'common', 6000), ('silver', 'rare', 3200), ('silver', 'epic', 700),  ('silver', 'legendary', 100), ('silver', 'icon', 0),
    ('gold',   'common', 3500), ('gold',   'rare', 4000), ('gold',   'epic', 2000), ('gold',   'legendary', 450), ('gold',   'icon', 50)
  ) as o(code, rarity, weight) on o.code = p.code;
