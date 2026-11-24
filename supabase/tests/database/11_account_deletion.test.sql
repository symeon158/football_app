-- Phase 9: deleting an account with real history removes all of it cleanly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'quin@example.test', '{"username":"quin"}'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'rae@example.test', '{"username":"rae"}');

-- Give Quin every kind of history (as the server / the user would create it).
select private.apply_coin_transaction('eeeeeeee-0000-0000-0000-000000000001', 20000, 'admin_adjustment', 'test:topup:quin-01');
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select public.buy_card((select id from public.player_cards where rarity = 'common' limit 1), 'del-buy-0001');
select public.open_pack((select id from public.card_packs where code = 'bronze'), 'del-pack-0001');
select public.upgrade_stadium('seating', 1::smallint, 'del-stad-0001');
select public.create_team('Quin Reserves', 'crest-02', '#111111', '#eeeeee', (select id from public.teams where is_active));
reset role;
set local role service_role;
select public.record_match('eeeeeeee-0000-0000-0000-000000000001', (select id from public.teams where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and is_active), 'del-match-01',
  jsonb_build_object('seed', 1, 'engine_version', '1.0.0', 'tactic', 'balanced', 'difficulty', 'normal', 'opponent_name', 'X', 'opponent_rating', 60,
    'home_score', 1, 'away_score', 0, 'stats', '{}'::jsonb, 'team_snapshot', '{}'::jsonb,
    'events', jsonb_build_array(jsonb_build_object('minute', 10, 'type', 'goal', 'side', 'home', 'player_name', 'Someone',
      'ownership_id', (select ownership_id from public.team_players tp join public.teams t on t.id = tp.team_id where t.user_id = 'eeeeeeee-0000-0000-0000-000000000001' and t.is_active and tp.slot = 9)))));
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select public.claim_achievement((select id from public.achievements where code = 'first_win'));
reset role;

select ok((select count(*) from public.coin_transactions where user_id = 'eeeeeeee-0000-0000-0000-000000000001') >= 5, 'history exists before deletion');

-- In production the auth service deletes the user as supabase_auth_admin, and
-- cascaded triggers run as that role. The test runner can't switch to it, so
-- guard structurally: trigger functions must run as their owner (definer),
-- except protect_wallet (checks current_user) and touch_updated_at (no table
-- access). The real API path is covered by web/scripts/smoke-account.mjs.
select is(
  (select array_agg(distinct p.proname::text order by p.proname::text)
     from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid join pg_namespace n on n.oid = p.pronamespace
    where not tg.tgisinternal and n.nspname = 'private' and not p.prosecdef
      and p.proname not in ('protect_wallet', 'touch_updated_at')),
  null, 'cascade-reachable trigger functions are SECURITY DEFINER');
select lives_ok($$delete from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000001'$$, 'account with full history deletes cleanly');

select is((
  select (select count(*) from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.wallets where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.coin_transactions where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.card_ownership where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.teams where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.stadiums where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.stadium_upgrades where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.matches where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.pack_openings where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.user_achievements where user_id = 'eeeeeeee-0000-0000-0000-000000000001')
       + (select count(*) from public.user_challenges where user_id = 'eeeeeeee-0000-0000-0000-000000000001'))::int, 0,
  'no personal game data remains');
select is((select count(*)::int from private.audit_log where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and details ? 'username'), 0,
          'audit log no longer holds the username');
select ok(exists (select 1 from private.audit_log where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and action = 'account_deleted'), 'deletion itself is audited');
select is((select count(*)::int from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000002'), 1, 'other accounts are untouched');

select * from finish();
rollback;
