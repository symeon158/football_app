-- New accounts receive profile, 1000 FC (via the ledger), stadium and a starter squad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"username":"alice_fc"}');

select is((select username::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          'alice_fc', 'profile created with requested username');

select is((select balance from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'),
          1000::bigint, 'wallet starts with 1000 FC');

select results_eq(
  $$select amount, balance_after, tx_type::text from public.coin_transactions
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values (1000::bigint, 1000::bigint, 'signup_bonus')$$,
  'signup bonus recorded in the ledger');

select is((select count(*)::int from public.stadiums where user_id = '11111111-1111-1111-1111-111111111111'),
          1, 'stadium created');
select is((select capacity from public.stadiums where user_id = '11111111-1111-1111-1111-111111111111'),
          5000, 'stadium starts at level-1 capacity');

select is((select count(*)::int from public.card_ownership where user_id = '11111111-1111-1111-1111-111111111111'),
          17, '17 starter cards (11 starters + 5 commons + 1 rare)');
select is((select count(*)::int from public.card_ownership co join public.player_cards pc on pc.id = co.card_id
            where co.user_id = '11111111-1111-1111-1111-111111111111' and pc.rarity = 'rare'),
          1, 'exactly one rare starter card');

select is((select count(*)::int from public.teams where user_id = '11111111-1111-1111-1111-111111111111' and is_active),
          1, 'one active team');
select is((select count(*)::int from public.team_players tp join public.teams t on t.id = tp.team_id
            where t.user_id = '11111111-1111-1111-1111-111111111111' and tp.slot <= 10),
          11, 'full starting XI assigned');

-- Every starter plays their natural position.
select is((select count(*)::int
             from public.team_players tp
             join public.teams t on t.id = tp.team_id
             join public.formation_slots fs on fs.formation = t.formation and fs.slot = tp.slot
             join public.card_ownership co on co.id = tp.ownership_id
             join public.player_cards pc on pc.id = co.card_id
            where t.user_id = '11111111-1111-1111-1111-111111111111' and pc.position <> fs.position),
          0, 'starters are in their natural positions');

select isnt((select captain_ownership_id from public.teams where user_id = '11111111-1111-1111-1111-111111111111'),
            null, 'captain assigned');

-- Taken or invalid usernames fall back to a generated one.
insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'bob@example.test', '{"username":"ALICE_FC"}');
select matches((select username::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
               '^manager_[0-9a-f]{12}$', 'duplicate username (case-insensitive) gets a generated name');

select * from finish();
rollback;
