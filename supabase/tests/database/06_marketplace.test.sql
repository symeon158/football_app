-- Phase 5: buy_card, open_pack, published odds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'jo@example.test', '{"username":"jo"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'kim@example.test', '{"username":"kim"}');

create temporary table fx as select
  (select id from public.player_cards where rarity = 'common' order by market_price limit 1) as cheap,
  (select market_price from public.player_cards where rarity = 'common' order by market_price limit 1) as cheap_price,
  (select id from public.player_cards where rarity = 'icon' limit 1) as icon,
  (select id from public.card_packs where code = 'bronze') as bronze,
  (select id from public.card_packs where code = 'silver') as silver,
  (select id from public.card_packs where code = 'gold') as gold;
grant select on fx to authenticated;

-- --------------------------------------------------------------- odds data
select is((select count(*)::int from (select pack_id from public.card_pack_odds group by pack_id having sum(weight) <> 10000) x), 0,
          'every pack''s odds sum to exactly 100%');
select is((select count(*)::int from public.card_packs where is_active), 3, 'three active packs');

-- Statistical check of the draw: 20,000 gold-pack draws match published odds within 1.2 percentage points.
create temporary table draws as select private.draw_rarity((select gold from fx)) as r from generate_series(1, 20000);
select ok(bool_and(abs(observed - expected) < 1.2), 'draw frequencies match published odds')
  from (select o.rarity, o.weight / 100.0 as expected,
               100.0 * (select count(*) from draws d where d.r = o.rarity) / 20000 as observed
          from public.card_pack_odds o where o.pack_id = (select gold from fx)) t;
select is((select count(*)::int from (select private.draw_rarity((select gold from fx), 'epic') r from generate_series(1, 2000)) x
            where public.rarity_rank(r) < public.rarity_rank('epic')), 0, 'guaranteed draws never fall below the minimum');

-- -------------------------------------------------------------------- anon
set local role anon;
select throws_ok($$select public.buy_card((select gen_random_uuid()), 'k-anon-0001')$$, '42501', null, 'anon cannot buy');
select throws_ok($$select count(*) from public.card_packs$$, '42501', null, 'anon cannot read packs');
reset role;

-- ------------------------------------------------------------------- as Jo
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select ok((select count(*) from public.card_pack_odds) = 15, 'odds are published to players');

-- buy_card
create temporary table bought (ownership_id uuid);
insert into bought select public.buy_card((select cheap from fx), 'k-buy-0001');
select is((select balance from public.wallets), 1000 - (select cheap_price from fx)::bigint, 'price charged');
select is((select card_id from public.card_ownership where id = (select ownership_id from bought)), (select cheap from fx), 'card granted');
select is((select acquired_via::text from public.card_ownership where id = (select ownership_id from bought)), 'market', 'acquired via market');
select is(public.buy_card((select cheap from fx), 'k-buy-0001'), (select ownership_id from bought), 'replayed purchase returns the same card');
select is((select balance from public.wallets), 1000 - (select cheap_price from fx)::bigint, 'replay is not charged again');
select is((select count(*)::int from public.card_ownership where card_id = (select cheap from fx) and acquired_via = 'market'), 1, 'replay grants nothing extra');
select results_eq($$select amount, tx_type::text, reference_type, reference_id from public.coin_transactions where idempotency_key = 'buy:k-buy-0001'$$,
                  $$select -(select cheap_price from fx)::bigint, 'card_purchase', 'player_card', (select cheap from fx)$$, 'purchase recorded in the ledger');
select throws_ok($$select public.buy_card((select icon from fx), 'k-buy-0002')$$, 'P0001', 'INSUFFICIENT_FUNDS', 'cannot afford an icon');
select throws_ok($$select public.buy_card(gen_random_uuid(), 'k-buy-0003')$$, 'P0002', 'CARD_NOT_AVAILABLE', 'unknown card rejected');
select throws_ok($$select public.buy_card((select cheap from fx), 'short')$$, '22023', 'INVALID_IDEMPOTENCY_KEY', 'bad key rejected');

-- open_pack
create temporary table opened (id uuid);
insert into opened select public.open_pack((select bronze from fx), 'k-pack-0001');
select is((select count(*)::int from public.card_ownership where pack_opening_id = (select id from opened)), 3, 'bronze pack gives 3 cards');
select is((select price_paid from public.pack_openings where id = (select id from opened)), 400, 'pack price recorded');
select is(public.open_pack((select bronze from fx), 'k-pack-0001'), (select id from opened), 'replayed opening returns the same pack');
select is((select count(*)::int from public.pack_openings), 1, 'replay opens nothing extra');
select throws_ok($$select public.open_pack((select gold from fx), 'k-pack-0002')$$, 'P0001', 'INSUFFICIENT_FUNDS', 'cannot afford gold');
reset role;

-- Give Jo plenty of coins (as the server would via rewards) to test guarantees and limits.
select private.apply_coin_transaction('aaaaaaaa-0000-0000-0000-000000000001', 50000, 'admin_adjustment', 'test:topup:jo-0001');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$select public.open_pack((select silver from fx), 'k-silver-' || g) from generate_series(1, 5) g$$, '5 silver packs open');
select is((select count(*)::int from public.pack_openings po
            where po.pack_id = (select silver from fx)
              and not exists (select 1 from public.card_ownership co join public.player_cards pc on pc.id = co.card_id
                               where co.pack_opening_id = po.id and public.rarity_rank(pc.rarity) >= public.rarity_rank('rare'))), 0,
          'every silver pack contains at least one Rare');
select throws_ok($$select public.open_pack((select silver from fx), 'k-silver-6')$$, 'P0001', 'PACK_LIMIT_REACHED', 'daily limit enforced');
select is((select sum(amount) from public.coin_transactions), (select balance::numeric from public.wallets), 'ledger still equals balance');

-- RLS: Kim cannot see Jo's openings or cards
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.pack_openings), 0, 'cannot see other users pack openings');
select is((select count(*)::int from public.card_ownership where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'cannot see other users cards');
select throws_ok($$insert into public.pack_openings (user_id, pack_id, coin_transaction_id, price_paid) values (auth.uid(), (select bronze from fx), 1, 1)$$,
                 '42501', null, 'cannot write pack openings directly');
select throws_ok($$select private.draw_rarity((select gold from fx))$$, '42501', null, 'cannot call the draw function');

select * from finish();
rollback;
