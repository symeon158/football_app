-- Phase 6: paid stadium upgrades.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'lia@example.test', '{"username":"lia"}');

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok($$select public.upgrade_stadium('seating', 1::smallint, 'k-anon-0001')$$, '42501', null, 'anon cannot upgrade');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';

select is(public.upgrade_stadium('seating', 1::smallint, 'k-seat-0001'), 2::smallint, 'seating upgraded to level 2');
select is((select capacity from public.stadiums), 12000, 'capacity follows seating level');
select is((select balance from public.wallets), 500::bigint, 'level-2 seating cost 500 FC');
select results_eq($$select category::text, from_level, to_level, cost from public.stadium_upgrades$$,
                  $$values ('seating', 1::smallint, 2::smallint, 500)$$, 'upgrade logged');
select results_eq($$select amount, tx_type::text, reference_type from public.coin_transactions where idempotency_key = 'stadium:k-seat-0001'$$,
                  $$values (-500::bigint, 'stadium_upgrade', 'stadium')$$, 'charge recorded in the ledger');

-- Replays and stale views
select is(public.upgrade_stadium('seating', 1::smallint, 'k-seat-0001'), 2::smallint, 'replay returns the same level');
select is((select balance from public.wallets), 500::bigint, 'replay not charged');
select is((select count(*)::int from public.stadium_upgrades), 1, 'replay logs nothing');
select throws_ok($$select public.upgrade_stadium('seating', 1::smallint, 'k-seat-0002')$$, 'P0001', 'STADIUM_LEVEL_CHANGED', 'stale expected level rejected');
select is((select balance from public.wallets), 500::bigint, 'rejected upgrade not charged');

-- Affordability and validation
select throws_ok($$select public.upgrade_stadium('seating', 2::smallint, 'k-seat-0003')$$, 'P0001', 'INSUFFICIENT_FUNDS', 'cannot afford level 3 seating (1500)');
select is((select seating_level from public.stadiums), 2::smallint, 'failed upgrade leaves the level unchanged');
select throws_ok($$select public.upgrade_stadium('lighting', 1::smallint, 'bad key!')$$, '22023', 'INVALID_IDEMPOTENCY_KEY', 'bad key rejected');

-- Direct writes stay forbidden; cosmetic edits stay allowed
select throws_ok($$update public.stadiums set seating_level = 5$$, '42501', null, 'cannot set levels directly');
update public.stadiums set name = 'Lia Park', design_template = 'bowl';
select results_eq($$select name, design_template from public.stadiums$$, $$values ('Lia Park', 'bowl')$$, 'name and design are editable');
reset role;

-- Max level: top up and climb lighting to 5.
select private.apply_coin_transaction('bbbbbbbb-0000-0000-0000-000000000001', 20000, 'admin_adjustment', 'test:topup:lia-0001');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select public.upgrade_stadium('lighting', (l)::smallint, 'k-light-000' || l) from generate_series(1, 4) l$$, 'lighting climbs to 5');
select is((select lighting_level from public.stadiums), 5::smallint, 'lighting at max');
select throws_ok($$select public.upgrade_stadium('lighting', 5::smallint, 'k-light-0005')$$, 'P0001', 'STADIUM_MAX_LEVEL', 'cannot exceed level 5');
select is((select sum(amount) from public.coin_transactions), (select balance::numeric from public.wallets), 'ledger still equals balance');

select * from finish();
rollback;
