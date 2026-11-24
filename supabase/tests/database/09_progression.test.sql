-- Phase 8: derived progress, claims, leaderboards, public profiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000001', 'nia@example.test', '{"username":"nia"}'),
  ('dddddddd-0000-0000-0000-000000000002', 'oto@example.test', '{"username":"oto"}');

create temporary table fx as select
  (select id from public.teams where user_id = 'dddddddd-0000-0000-0000-000000000001') as team,
  (select id from public.challenges where code = 'daily_play_2') as play2,
  (select id from public.challenges where code = 'daily_win_1') as win1,
  (select id from public.challenges where code = 'collect_rare_5') as rare5,
  (select id from public.achievements where code = 'first_win') as first_win;
grant select on fx to authenticated, service_role;

-- ------------------------------------------------------- cached team metrics
select ok((select overall_cached from public.teams where id = (select team from fx)) between 40 and 80, 'new squad has a cached rating');
select ok((select chemistry_cached from public.teams where id = (select team from fx)) between 1 and 100, 'new squad has cached chemistry');
select is(private.effective_rating('ST', 'ST', 80), 80, 'natural position: full rating');
select is(private.effective_rating('ST', 'CAM', 80), 72, 'related position: 90%');
select is(private.effective_rating('ST', 'CB', 80), 60, 'unrelated: 75%');
select is(private.effective_rating('GK', 'ST', 80), 24, 'GK mismatch: 30%');

-- Emptying the squad drops the cache to 0; it follows every change.
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
create temporary table saved as select jsonb_agg(jsonb_build_object('slot', slot, 'ownership_id', ownership_id)) as slots, (select captain_ownership_id from public.teams where id = (select team from fx)) as cap
  from public.team_players where team_id = (select team from fx);
select public.save_lineup((select team from fx), '4-3-3', 'balanced', null, '[]');
select results_eq($$select overall_cached::int, chemistry_cached::int from public.teams where id = (select team from fx)$$, $$values (0, 0)$$, 'cache follows line-up changes');
select public.save_lineup((select team from fx), '4-3-3', 'balanced', (select cap from saved), (select slots from saved));
select ok((select overall_cached from public.teams where id = (select team from fx)) > 0, 'cache restored after saving the XI again');

-- ------------------------------------------------------------- challenges
select is((select count(*)::int from public.get_challenges()), (select count(*)::int from public.challenges where is_active), 'all active challenges listed');
select results_eq($$select progress, completed, claimed from public.get_challenges() where id = (select play2 from fx)$$, $$values (0, false, false)$$, 'no progress before playing');
select throws_ok($$select public.claim_challenge((select play2 from fx))$$, 'P0001', 'NOT_COMPLETED', 'cannot claim an unfinished challenge');
select throws_ok($$insert into public.user_challenges (user_id, challenge_id, period_start, progress, completed_at, claimed_at) values (auth.uid(), (select play2 from fx), current_date, 2, now(), now())$$,
                 '42501', null, 'cannot write challenge progress directly');
reset role;

-- Two matches today (one win), recorded by the server.
set local role service_role;
create function pg_temp.p(h int, a int) returns jsonb language sql as $$
  select jsonb_build_object('seed', 1, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', 'normal',
    'opponent_name', 'X', 'opponent_rating', 60, 'home_score', h, 'away_score', a, 'stats', '{}'::jsonb, 'team_snapshot', '{}'::jsonb,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('minute', g, 'type', 'goal', 'side', 'home')), '[]'::jsonb) from generate_series(1, h) g)
             || (select coalesce(jsonb_agg(jsonb_build_object('minute', 50 + g, 'type', 'goal', 'side', 'away')), '[]'::jsonb) from generate_series(1, a) g));
$$;
grant execute on function pg_temp.p(int, int) to service_role;
select public.record_match('dddddddd-0000-0000-0000-000000000001', (select team from fx), 'k-p8-00001', pg_temp.p(2, 0));
update public.matches set created_at = now() - interval '1 minute' where user_id = 'dddddddd-0000-0000-0000-000000000001';
select public.record_match('dddddddd-0000-0000-0000-000000000001', (select team from fx), 'k-p8-00002', pg_temp.p(1, 1));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq($$select progress, completed from public.get_challenges() where id = (select play2 from fx)$$, $$values (2, true)$$, 'progress derived from matches');
create temporary table bal as select balance from public.wallets;
select lives_ok($$select public.claim_challenge((select play2 from fx))$$, 'completed challenge can be claimed');
select is((select balance from public.wallets), (select balance from bal) + (select reward_coins from public.challenges where code = 'daily_play_2')::bigint, 'challenge reward paid');
select throws_ok($$select public.claim_challenge((select play2 from fx))$$, 'P0001', 'ALREADY_CLAIMED', 'a challenge pays once per period');
select results_eq($$select claimed from public.get_challenges() where id = (select play2 from fx)$$, $$values (true)$$, 'shown as claimed');
select is((select count(*)::int from public.coin_transactions where tx_type = 'challenge_reward'), 1, 'exactly one challenge payout in the ledger');

-- ------------------------------------------------------------ achievements
select results_eq($$select unlocked, claimed from public.get_achievements() where id = (select first_win from fx)$$, $$values (true, false)$$, 'first win unlocked, not yet claimed');
select lives_ok($$select public.claim_achievement((select first_win from fx))$$, 'achievement claimed');
select throws_ok($$select public.claim_achievement((select first_win from fx))$$, 'P0001', 'ALREADY_CLAIMED', 'achievement pays once');
select throws_ok($$select public.claim_achievement((select id from public.achievements where code = 'ten_wins'))$$, 'P0001', 'NOT_COMPLETED', 'locked achievement cannot be claimed');
select is((select sum(amount) from public.coin_transactions), (select balance::numeric from public.wallets), 'ledger still equals balance');

-- ------------------------------------------------------------ leaderboards
select ok((select count(*) from public.get_leaderboard('wins', 'week')) >= 1, 'weekly wins board has entries');
select results_eq($$select value, is_me from public.get_leaderboard('wins', 'all') where is_me$$, $$values (1::bigint, true)$$, 'my row and value are included');
select throws_ok($$select * from public.get_leaderboard('emails', 'all')$$, '22023', 'INVALID_LEADERBOARD', 'unknown boards rejected');
select ok((select count(*) from public.get_leaderboard('level', 'all', 1)) between 1 and 2, 'limit respected (plus my own row)');

-- -------------------------------------------------------- public profiles
select is((public.get_manager_profile('OTO') ->> 'username'), 'oto', 'other managers'' public profile (case-insensitive)');
select ok(not (public.get_manager_profile('oto') ? 'email') and (public.get_manager_profile('oto')::text not like '%@example.test%'), 'no e-mail in public profiles');
select is((public.get_manager_profile('nia') -> 'badges' -> 0 ->> 'code'), 'first_win', 'claimed badges shown');
reset role;

set local role anon;
select throws_ok($$select * from public.get_leaderboard('level')$$, '42501', null, 'anon cannot read leaderboards');

select * from finish();
rollback;
