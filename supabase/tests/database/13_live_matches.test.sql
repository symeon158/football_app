-- Interactive matches: start at kick-off, decisions in strict order, settle once at full time.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'lia@example.test', '{"username":"lia"}');
create temporary table fx as select (select id from public.teams where user_id = 'eeeeeeee-0000-0000-0000-000000000001') as team;
grant select on fx to authenticated, service_role;

create function pg_temp.kickoff() returns jsonb language sql as $$
  select jsonb_build_object('seed', 9, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', 'normal',
    'opponent_name', 'Test Rovers', 'opponent_rating', 60, 'team_snapshot', '{"keyMoments": true}'::jsonb,
    'stats', '{"homeOverall": 60}'::jsonb);
$$;
create function pg_temp.result(h int, a int) returns jsonb language sql as $$
  select jsonb_build_object('home_score', h, 'away_score', a, 'stats', '{"homeOverall": 60, "home": {}}'::jsonb,
    'events', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
       select jsonb_build_object('minute', 10 + g, 'type', 'goal', 'side', 'home', 'player_name', 'A') e from generate_series(1, h) g
       union all
       select jsonb_build_object('minute', 50 + g, 'type', 'goal', 'side', 'away', 'player_name', 'B') from generate_series(1, a) g) x));
$$;
grant execute on function pg_temp.kickoff(), pg_temp.result(int, int) to authenticated, service_role;

-- ------------------------------------------------------------ trust boundary
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.start_match(auth.uid(), (select team from fx), 'k-live-cheat', pg_temp.kickoff())$$, '42501', null, 'players cannot start matches');
select throws_ok($$select public.record_match_decision(auth.uid(), gen_random_uuid(), 0, 'shoot')$$, '42501', null, 'players cannot record decisions');
select throws_ok($$select public.finish_match(auth.uid(), gen_random_uuid(), pg_temp.result(9, 0))$$, '42501', null, 'players cannot finish matches');
reset role;

-- --------------------------------------------------------------- kick-off
set local role service_role;
create temporary table m as select public.start_match('eeeeeeee-0000-0000-0000-000000000001', (select team from fx), 'k-live-0001', pg_temp.kickoff()) as id;
grant select on m to authenticated;
reset role;
select results_eq($$select status::text, rewarded, reward_coins, jsonb_array_length(decisions) from public.matches where id = (select id from m)$$,
  $$values ('in_progress'::text, false, 0, 0)$$, 'kick-off creates an unpaid in-progress match');
select is((select count(*)::int from public.coin_transactions where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and tx_type = 'match_reward'), 0,
  'nothing is paid at kick-off');
set local role service_role;
select is(public.start_match('eeeeeeee-0000-0000-0000-000000000001', (select team from fx), 'k-live-0001', pg_temp.kickoff()), (select id from m),
  'kick-off is idempotent');
select throws_ok($$select public.start_match('eeeeeeee-0000-0000-0000-000000000001', (select team from fx), 'k-live-0002', pg_temp.kickoff())$$,
  'P0001', 'MATCH_COOLDOWN', 'the cooldown applies from kick-off');

-- --------------------------------------------------------------- decisions
select lives_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 0, 'attacking')$$, 'first decision recorded');
select lives_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 0, 'attacking')$$, 'repeating the same decision is harmless');
select throws_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 0, 'defensive')$$,
  'P0001', 'DECISION_ALREADY_MADE', 'a made decision cannot be changed');
select throws_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 2, 'shoot')$$,
  '22023', 'INVALID_DECISION', 'decisions cannot skip a moment');
select throws_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 1, 'DROP TABLE')$$,
  '22023', 'INVALID_DECISION', 'decision values are validated');
select lives_ok($$select public.record_match_decision('eeeeeeee-0000-0000-0000-000000000001', (select id from m), 1, 'shoot')$$, 'second decision recorded');
reset role;
select is((select decisions from public.matches where id = (select id from m)), '["attacking", "shoot"]'::jsonb, 'decisions are stored in order');

-- --------------------------------------------------------------- full time
set local role service_role;
select is(public.finish_match('eeeeeeee-0000-0000-0000-000000000001', (select id from m), pg_temp.result(2, 1)), (select id from m), 'full time settles the match');
select is(public.finish_match('eeeeeeee-0000-0000-0000-000000000001', (select id from m), pg_temp.result(9, 0)), (select id from m), 'finishing again is a no-op');
reset role;
select results_eq($$select status::text, home_score::int, away_score::int, rewarded, reward_coins from public.matches where id = (select id from m)$$,
  $$values ('completed'::text, 2, 1, true, (select coins from public.match_rewards() where difficulty = 'normal' and result = 'win') + 20 + 50)$$,
  'the first result counts and is paid once');

select * from finish();
rollback;
