-- Phase 7: record_match trust boundary, rewards, limits and progression.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000001', 'max@example.test', '{"username":"max"}');

create temporary table fx as select
  (select id from public.teams where user_id = 'cccccccc-0000-0000-0000-000000000001') as team,
  (select tp.ownership_id from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.user_id = 'cccccccc-0000-0000-0000-000000000001' and tp.slot = 9) as striker;
grant select on fx to authenticated, service_role;

-- Helper building a minimal valid payload.
create function pg_temp.payload(h int, a int, diff text default 'normal') returns jsonb language sql as $$
  select jsonb_build_object(
    'seed', 42, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', diff,
    'opponent_name', 'Test Rovers', 'opponent_rating', 60,
    'home_score', h, 'away_score', a, 'stats', '{}'::jsonb, 'team_snapshot', '{}'::jsonb,
    'events', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
       select jsonb_build_object('minute', 10 + g, 'type', 'goal', 'side', 'home', 'player_name', 'Striker',
                                 'ownership_id', (select striker from fx)) e from generate_series(1, h) g
       union all
       select jsonb_build_object('minute', 50 + g, 'type', 'goal', 'side', 'away', 'player_name', 'Rival') from generate_series(1, a) g
     ) x));
$$;
grant execute on function pg_temp.payload(int, int, text) to authenticated, service_role;

-- --------------------------------------------------------- progression math
select results_eq($$select public.level_for_xp(x) from unnest(array[0, 99, 100, 299, 300, 4499, 4500, 999999999]::bigint[]) x$$,
                  $$values (1), (1), (2), (2), (3), (9), (10), (99)$$, 'level_for_xp matches the TypeScript thresholds');
select is((select count(*)::int from public.match_rewards()), 9, 'reward table covers 3 difficulties x 3 results');
select is((select coins from public.match_rewards() where difficulty = 'hard' and result = 'win'), 225, 'hard win pays 1.5x');

-- ----------------------------------------------------------- trust boundary
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.record_match(auth.uid(), (select team from fx), 'k-cheat-0001', pg_temp.payload(9, 0))$$,
                 '42501', null, 'players cannot record their own results');
select throws_ok($$insert into public.matches (user_id, opponent_name, opponent_rating, tactic, seed, engine_version) values (auth.uid(), 'x', 1, 'balanced', 1, 'x')$$,
                 '42501', null, 'players cannot insert matches directly');
select throws_ok($$update public.profiles set xp = 999999 where id = auth.uid()$$, '42501', null, 'players cannot grant themselves XP');
reset role;

set local role service_role;
-- A 3-1 normal win: 150 + 3 goals x 10 + 5,000 seats / 100 = 230 FC, 50 XP.
create temporary table m1 as select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0001', pg_temp.payload(3, 1)) as id;
select results_eq($$select home_score, away_score, reward_coins, xp_gained, status::text, difficulty from public.matches where id = (select id from m1)$$,
                  $$values (3::smallint, 1::smallint, 230, 50, 'completed', 'normal')$$, 'win recorded with server-computed rewards');
select is((select balance from public.wallets where user_id = 'cccccccc-0000-0000-0000-000000000001'), 1230::bigint, 'reward paid into the wallet');
select results_eq($$select amount, tx_type::text, reference_type from public.coin_transactions where idempotency_key = 'match:' || (select id from m1)$$,
                  $$values (230::bigint, 'match_reward', 'match')$$, 'reward recorded in the ledger');
select results_eq($$select xp, level from public.profiles where id = 'cccccccc-0000-0000-0000-000000000001'$$, $$values (50::bigint, 1)$$, 'XP added');
select is((select count(*)::int from public.match_events where match_id = (select id from m1)), 4, 'events stored');
select is((select ownership_id from public.match_events where match_id = (select id from m1) and side = 'home' limit 1), (select striker from fx), 'goals linked to the scorer''s card');
select is((select count(*)::int from public.match_events where match_id = (select id from m1) and side = 'away' and ownership_id is not null), 0, 'opponent events carry no card links');

-- Idempotency, cooldown, validation
select is(public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0001', pg_temp.payload(9, 0)), (select id from m1), 'replay returns the original match');
select is((select count(*)::int from public.matches where user_id = 'cccccccc-0000-0000-0000-000000000001'), 1, 'replay does not create or pay again');
select throws_ok($$select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0002', pg_temp.payload(1, 0))$$,
                 'P0001', 'MATCH_COOLDOWN', 'cooldown between matches');
update public.matches set created_at = now() - interval '1 minute';
select throws_ok($$select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0003', pg_temp.payload(2, 0) || '{"home_score": 5}')$$,
                 '22023', 'INVALID_MATCH', 'score must agree with the goal events');
select throws_ok($$select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0004', pg_temp.payload(1, 0, 'godmode'))$$,
                 '22023', 'INVALID_MATCH', 'unknown difficulty rejected');
select throws_ok($$select public.record_match('cccccccc-0000-0000-0000-000000000001', gen_random_uuid(), 'k-match-0005', pg_temp.payload(1, 0))$$,
                 'P0002', 'TEAM_NOT_FOUND', 'must be the player''s own team');

-- Loss on hard and level-up
create temporary table m2 as select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0006', pg_temp.payload(0, 2, 'hard')) as id;
select results_eq($$select reward_coins, xp_gained from public.matches where id = (select id from m2)$$, $$values (60 + 50, 30)$$, 'hard loss: 40x1.5 + 50 matchday');
update public.matches set created_at = now() - interval '2 minutes';
select lives_ok($$select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0007', pg_temp.payload(2, 0))$$, 'third match');
select results_eq($$select xp, level from public.profiles where id = 'cccccccc-0000-0000-0000-000000000001'$$, $$values (130::bigint, 2)$$, 'crossing 100 XP reaches level 2');

-- Daily reward cap: pretend 30 rewarded matches already happened today.
update public.matches set created_at = now() - interval '3 minutes';
insert into public.matches (user_id, team_id, opponent_name, opponent_rating, tactic, seed, engine_version, status, completed_at, rewarded, created_at)
select 'cccccccc-0000-0000-0000-000000000001', (select team from fx), 'Filler', 50, 'balanced', g, '1.0.0', 'completed', now(), true, now() - interval '10 minutes'
  from generate_series(1, 27) g;
create temporary table m3 as select public.record_match('cccccccc-0000-0000-0000-000000000001', (select team from fx), 'k-match-0008', pg_temp.payload(4, 0)) as id;
select results_eq($$select reward_coins, xp_gained, rewarded from public.matches where id = (select id from m3)$$, $$values (0, 0, false)$$, 'after 30 rewarded matches, no more rewards today');
select is((select count(*)::int from public.coin_transactions where reference_id = (select id from m3)), 0, 'no ledger entry for unrewarded match');
select is((select sum(amount) from public.coin_transactions where user_id = 'cccccccc-0000-0000-0000-000000000001'),
          (select balance::numeric from public.wallets where user_id = 'cccccccc-0000-0000-0000-000000000001'), 'ledger still equals balance');
reset role;

-- Privilege audit for the new function
select ok(not has_function_privilege('authenticated', 'public.record_match(uuid, uuid, text, jsonb)', 'execute'), 'authenticated has no EXECUTE on record_match');

select * from finish();
rollback;
