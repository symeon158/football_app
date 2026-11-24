-- Friend matches: scouting, trust boundary, per-opponent reward cap, opponent visibility, deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000001', 'ana@example.test',  '{"username":"ana"}'),
  ('dddddddd-0000-0000-0000-000000000002', 'ben@example.test',  '{"username":"ben"}'),
  ('dddddddd-0000-0000-0000-000000000003', 'cleo@example.test', '{"username":"cleo"}');

create temporary table fx as select
  (select id from public.teams where user_id = 'dddddddd-0000-0000-0000-000000000001') as ana_team,
  (select id from public.teams where user_id = 'dddddddd-0000-0000-0000-000000000002') as ben_team;
grant select on fx to authenticated, service_role;

create function pg_temp.friendly(h int, a int, opp uuid, opp_team uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'seed', 7, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', 'hard',
    'opponent_name', 'Ben FC', 'opponent_rating', 60, 'opponent_user_id', opp, 'opponent_team_id', opp_team,
    'home_score', h, 'away_score', a, 'stats', '{}'::jsonb, 'team_snapshot', '{}'::jsonb,
    'events', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
       select jsonb_build_object('minute', 10 + g, 'type', 'goal', 'side', 'home', 'player_name', 'A') e from generate_series(1, h) g
       union all
       select jsonb_build_object('minute', 50 + g, 'type', 'goal', 'side', 'away', 'player_name', 'B') from generate_series(1, a) g
     ) x));
$$;
grant execute on function pg_temp.friendly(int, int, uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------- scouting
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is((public.get_friendly_opponent('BEN') ->> 'username'), 'ben', 'opponent found by username (case-insensitive)');
select is(jsonb_array_length(public.get_friendly_opponent('ben') -> 'players'), 17, 'scouting shows the opponent''s full squad');
select is((public.get_friendly_opponent('ben') -> 'team' ->> 'id')::uuid, (select ben_team from fx), 'scouting returns the active team');
select ok(not (public.get_friendly_opponent('ben') ? 'email'), 'scouting never exposes the e-mail');
select is(public.get_friendly_opponent('nobody_here'), null, 'unknown manager returns null');
select throws_ok($$select public.get_friendly_opponent('ana')$$, '22023', 'CANNOT_CHALLENGE_SELF', 'cannot challenge yourself');
select throws_ok($$select public.record_match(auth.uid(), (select ana_team from fx), 'k-friend-cheat', pg_temp.friendly(5, 0, 'dddddddd-0000-0000-0000-000000000002', (select ben_team from fx)))$$,
                 '42501', null, 'players still cannot record results');
reset role;

set local role anon;
select throws_ok($$select public.get_friendly_opponent('ben')$$, '42501', null, 'anonymous visitors cannot scout');
reset role;

-- ------------------------------------------------------------ record_match
set local role service_role;
select throws_ok($$select public.record_match('dddddddd-0000-0000-0000-000000000001', (select ana_team from fx), 'k-friend-self', pg_temp.friendly(1, 0, 'dddddddd-0000-0000-0000-000000000001', (select ana_team from fx)))$$,
                 '22023', 'CANNOT_CHALLENGE_SELF', 'record_match rejects self-challenges');
select throws_ok($$select public.record_match('dddddddd-0000-0000-0000-000000000001', (select ana_team from fx), 'k-friend-wrongteam', pg_temp.friendly(1, 0, 'dddddddd-0000-0000-0000-000000000002', (select ana_team from fx)))$$,
                 'P0002', 'OPPONENT_NOT_FOUND', 'the opponent team must belong to the opponent');
create temporary table m1 as select public.record_match('dddddddd-0000-0000-0000-000000000001', (select ana_team from fx), 'k-friend-0001',
  pg_temp.friendly(2, 1, 'dddddddd-0000-0000-0000-000000000002', (select ben_team from fx))) as id;
grant select on m1 to authenticated;
reset role;

select results_eq($$select difficulty, opponent_user_id, opponent_team_id, rewarded from public.matches where id = (select id from m1)$$,
  $$values ('normal'::text, 'dddddddd-0000-0000-0000-000000000002'::uuid, (select ben_team from fx), true)$$,
  'friend match is stored with the opponent and always uses normal difficulty');
select is((select reward_coins from public.matches where id = (select id from m1)),
          (select coins from public.match_rewards() where difficulty = 'normal' and result = 'win') + 20 + 50,
          'normal win reward + goal bonus + matchday income');

-- Per-opponent cap: 5 paid friend matches per opponent per day, then friendlies.
update public.matches set created_at = now() - interval '10 minutes' where id = (select id from m1);
insert into public.matches (user_id, team_id, opponent_name, opponent_rating, tactic, seed, engine_version, status, completed_at, rewarded, created_at, opponent_user_id, opponent_team_id)
select 'dddddddd-0000-0000-0000-000000000001', (select ana_team from fx), 'Ben FC', 60, 'balanced', g, '1.0.0', 'completed', now(), true,
       now() - interval '9 minutes', 'dddddddd-0000-0000-0000-000000000002', (select ben_team from fx)
  from generate_series(1, 4) g;
set local role service_role;
create temporary table m2 as select public.record_match('dddddddd-0000-0000-0000-000000000001', (select ana_team from fx), 'k-friend-0002',
  pg_temp.friendly(3, 0, 'dddddddd-0000-0000-0000-000000000002', (select ben_team from fx))) as id;
reset role;
select results_eq($$select reward_coins, xp_gained, rewarded from public.matches where id = (select id from m2)$$,
  $$values (0, 0, false)$$, 'sixth match against the same opponent today pays nothing');
select is((select sum(amount) from public.coin_transactions where user_id = 'dddddddd-0000-0000-0000-000000000001'),
          (select balance::numeric from public.wallets where user_id = 'dddddddd-0000-0000-0000-000000000001'), 'ledger still equals balance');

-- ---------------------------------------------------------- opponent view
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.matches where opponent_user_id = auth.uid()), 6, 'the opponent can read matches played against them');
select ok((select count(*) from public.match_events where match_id = (select id from m1)) > 0, 'the opponent can read the timeline');
select is((public.get_friendly_opponent('ana') -> 'h2h' ->> 'lost')::int, 2, 'head-to-head is shown from the viewer''s side');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.matches where id = (select id from m1)), 0, 'a third manager cannot read it');
reset role;

-- ------------------------------------------------------------- deletion
delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000002';
select results_eq($$select opponent_name, opponent_user_id, opponent_team_id from public.matches where id = (select id from m1)$$,
  $$values ('Deleted club'::text, null::uuid, null::uuid)$$, 'deleted opponent is no longer named or linked');
select is((select count(*)::int from public.matches where user_id = 'dddddddd-0000-0000-0000-000000000001'), 6,
          'the challenger keeps their match history');

select * from finish();
rollback;
