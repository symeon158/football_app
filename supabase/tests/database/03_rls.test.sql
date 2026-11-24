-- Row Level Security and privilege boundaries as seen by real API roles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'dan@example.test', '{"username":"dan"}'),
  ('55555555-5555-5555-5555-555555555555', 'eve@example.test', '{"username":"eve"}');

-- Grab one of Eve's cards (as superuser) for the cross-user tests.
create temporary table eve_card as
  select id from public.card_ownership where user_id = '55555555-5555-5555-5555-555555555555' limit 1;
grant select on eve_card to authenticated;

-- Take Dan's last bench card out of the squad so he owns a card outside the team.
delete from public.team_players tp using public.teams t
 where t.id = tp.team_id and t.user_id = '44444444-4444-4444-4444-444444444444' and tp.slot = 16;

-- ---------------------------------------------------------------- anonymous
set local role anon;
select throws_ok($$select count(*) from public.players$$, '42501', null, 'anon cannot read the catalogue');
select throws_ok($$select count(*) from public.wallets$$, '42501', null, 'anon cannot read wallets');
select ok(public.is_username_available('free_name'), 'anon can check username availability');
reset role;

-- ------------------------------------------------------------ as Dan
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select ok((select count(*) from public.player_cards) > 100, 'catalogue readable when signed in');
select is((select username::text from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
          'eve', 'other users public profiles (leaderboards) readable');

select is((select count(*)::int from public.wallets), 1, 'sees only own wallet');
select is((select count(*)::int from public.card_ownership
            where user_id = '55555555-5555-5555-5555-555555555555'), 0, 'cannot see other users cards');
select is((select count(*)::int from public.teams), 1, 'sees only own team');

select throws_ok($$update public.wallets set balance = 999999$$,
                 '42501', null, 'cannot update wallet balance');
select throws_ok($$insert into public.coin_transactions (user_id, amount, balance_after, tx_type, idempotency_key)
                   values ('44444444-4444-4444-4444-444444444444', 5000, 6000, 'admin_adjustment', 'hack:00000001')$$,
                 '42501', null, 'cannot write to the ledger');
select throws_ok($$select private.apply_coin_transaction('44444444-4444-4444-4444-444444444444', 5000, 'admin_adjustment', 'hack:00000002')$$,
                 '42501', null, 'cannot call private ledger function');
select throws_ok($$update public.profiles set level = 99 where id = '44444444-4444-4444-4444-444444444444'$$,
                 '42501', null, 'cannot change own level');
select throws_ok($$update public.stadiums set seating_level = 5$$,
                 '42501', null, 'cannot upgrade stadium for free');
select throws_ok($$insert into public.card_ownership (user_id, card_id, acquired_via)
                   select '44444444-4444-4444-4444-444444444444', id, 'reward' from public.player_cards limit 1$$,
                 '42501', null, 'cannot grant self cards');

-- Allowed: cosmetic profile edit
update public.profiles set display_name = 'Dan the Manager' where id = '44444444-4444-4444-4444-444444444444';
select is((select display_name from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
          'Dan the Manager', 'can edit own display name');

-- Since Phase 4, line-ups change only through save_lineup(): direct writes are refused…
select throws_ok($$insert into public.team_players (team_id, ownership_id, slot)
                   select t.id, (select id from eve_card), 20 from public.teams t$$,
                 '42501', null, 'cannot write team_players directly');

-- …and save_lineup() refuses cards owned by someone else.
select throws_ok($$select public.save_lineup(
                     (select id from public.teams limit 1), '4-3-3', 'balanced', null,
                     jsonb_build_array(jsonb_build_object('slot', 0, 'ownership_id', (select id from eve_card))))$$,
                 '42501', 'CARD_NOT_OWNED', 'cannot field a card owned by someone else');

-- Cannot write to another user's team.
update public.teams set name = 'Hijacked FC' where user_id = '55555555-5555-5555-5555-555555555555';
reset role;
select is((select name from public.teams where user_id = '55555555-5555-5555-5555-555555555555'),
          'eve FC', 'other users teams are untouched');

select * from finish();
rollback;
