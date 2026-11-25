-- Matchday: orders only at the revealed minute, which only moves forward.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ffffffff-0000-0000-0000-000000000001', 'noa@example.test', '{"username":"noa"}');
create temporary table fx as select (select id from public.teams where user_id = 'ffffffff-0000-0000-0000-000000000001') as team;
grant select on fx to authenticated, service_role;

create function pg_temp.kickoff() returns jsonb language sql as $$
  select jsonb_build_object('seed', 5, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', 'normal',
    'opponent_name', 'Test Rovers', 'opponent_rating', 60, 'team_snapshot', '{"matchday": true}'::jsonb, 'stats', '{}'::jsonb);
$$;
grant execute on function pg_temp.kickoff() to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.reveal_match_minute(auth.uid(), gen_random_uuid(), 90)$$, '42501', null, 'players cannot reveal minutes');
select throws_ok($$select public.record_match_order(auth.uid(), gen_random_uuid(), 0, '{"kind":"tactic","value":"attacking"}')$$, '42501', null, 'players cannot give orders directly');
reset role;

set local role service_role;
create temporary table m as select public.start_match('ffffffff-0000-0000-0000-000000000001', (select team from fx), 'k-md-0001', pg_temp.kickoff()) as id;
select is(public.reveal_match_minute('ffffffff-0000-0000-0000-000000000001', (select id from m), 20), 20::smallint, 'revealing moves the minute forward');
select is(public.reveal_match_minute('ffffffff-0000-0000-0000-000000000001', (select id from m), 10), 20::smallint, 'the revealed minute never goes back');
select throws_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 15, '{"kind":"tactic","value":"attacking"}')$$,
  'P0001', 'ORDER_TOO_LATE', 'an order cannot be given for a minute already played');
select throws_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 25, '{"kind":"tactic","value":"attacking"}')$$,
  'P0001', 'ORDER_TOO_LATE', 'an order cannot be given for a future minute');
select lives_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 20, '{"kind":"tactic","value":"attacking"}')$$,
  'an order at the revealed minute is accepted');
select throws_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 20, '{"kind":"tactic","value":"park the bus"}')$$,
  '22023', 'INVALID_ORDER', 'order values are validated');
select throws_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 20, '{"kind":"sub","off":"x","on":"y"}')$$,
  '22023', 'INVALID_ORDER', 'substitutions must name real card ids');
select lives_ok($$select public.record_match_order('ffffffff-0000-0000-0000-000000000001', (select id from m), 20, '{"kind":"shout","value":"press","extra":"ignored"}')$$,
  'a shout is accepted');
reset role;
select is((select orders from public.matches where id = (select id from m)),
  '[{"minute": 20, "kind": "tactic", "value": "attacking"}, {"minute": 20, "kind": "shout", "value": "press"}]'::jsonb,
  'orders are stored in order, with only the known fields');

select * from finish();
rollback;
