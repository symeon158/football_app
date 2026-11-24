-- Phase 4: save_lineup / create_team / delete_team.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'hal@example.test', '{"username":"hal"}'),
  ('99999999-9999-9999-9999-999999999999', 'ivy@example.test', '{"username":"ivy"}');

-- Give Hal a second copy of one of his starters (as superuser) for duplicate tests.
insert into public.card_ownership (user_id, card_id, acquired_via)
select co.user_id, co.card_id, 'reward'
  from public.card_ownership co
  join public.team_players tp on tp.ownership_id = co.id and tp.slot = 9
 where co.user_id = '88888888-8888-8888-8888-888888888888';

create temporary table fx as
select
  (select id from public.teams where user_id = '88888888-8888-8888-8888-888888888888') as team,
  (select ownership_id from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.user_id = '88888888-8888-8888-8888-888888888888' and slot = 9) as striker,
  (select co.id from public.card_ownership co
    where co.user_id = '88888888-8888-8888-8888-888888888888' and co.acquired_via = 'reward') as striker_copy,
  (select ownership_id from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.user_id = '88888888-8888-8888-8888-888888888888' and slot = 12) as sub,
  (select id from public.card_ownership where user_id = '99999999-9999-9999-9999-999999999999' limit 1) as ivy_card,
  (select jsonb_agg(jsonb_build_object('slot', tp.slot, 'ownership_id', tp.ownership_id) order by tp.slot)
     from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.user_id = '88888888-8888-8888-8888-888888888888') as current_slots;
grant select on fx to authenticated;

-- ------------------------------------------------------------- anonymous
set local role anon;
select throws_ok($$select public.save_lineup(null, '4-3-3', 'balanced', null, '[]')$$, '42501', null, 'anon cannot call save_lineup');
select throws_ok($$select public.create_team('Anon FC')$$, '42501', null, 'anon cannot call create_team');
reset role;

-- ------------------------------------------------------------------ as Hal
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

-- Valid save: change formation + tactic, move the sub to slot 13, keep captain.
select lives_ok($$select public.save_lineup((select team from fx), '4-4-2', 'attacking',
                    (select striker from fx),
                    (select jsonb_agg(case when (e->>'slot')::int = 12 then jsonb_build_object('slot', 20, 'ownership_id', e->>'ownership_id') else e end)
                       from jsonb_array_elements((select current_slots from fx)) e))$$,
                'valid line-up saves');
select results_eq($$select formation::text, tactic::text, captain_ownership_id from public.teams where id = (select team from fx)$$,
                  $$select '4-4-2', 'attacking', (select striker from fx)$$, 'formation, tactic and captain stored');
select is((select slot from public.team_players where ownership_id = (select sub from fx)), 20::smallint, 'player moved to new slot');
select is((select count(*)::int from public.team_players where team_id = (select team from fx)), 17, 'all 17 players kept');

-- Rejections
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', null,
                    (select current_slots from fx) || jsonb_build_array(jsonb_build_object('slot', 20, 'ownership_id', (select striker_copy from fx))))$$,
                 '23505', 'DUPLICATE_PLAYER', 'two copies of the same player are rejected');
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', (select sub from fx), (select current_slots from fx))$$,
                 '23514', 'CAPTAIN_NOT_STARTER', 'captain must be a starter');
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', null,
                    jsonb_build_array(jsonb_build_object('slot', 0, 'ownership_id', (select ivy_card from fx))))$$,
                 '42501', 'CARD_NOT_OWNED', 'cannot use another users card');
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', null,
                    jsonb_build_array(jsonb_build_object('slot', 0, 'ownership_id', (select striker from fx)),
                                      jsonb_build_object('slot', 0, 'ownership_id', (select sub from fx))))$$,
                 '22023', 'INVALID_LINEUP', 'duplicate slots rejected');
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', null,
                    jsonb_build_array(jsonb_build_object('slot', 23, 'ownership_id', (select striker from fx))))$$,
                 '22023', 'INVALID_LINEUP', 'out-of-range slot rejected');
select throws_ok($$select public.save_lineup((select team from fx), '4-3-3', 'balanced', null, '[{"slot": "x"}]')$$,
                 '22023', 'INVALID_LINEUP', 'malformed payload rejected');
select is((select formation::text from public.teams where id = (select team from fx)), '4-4-2', 'failed saves change nothing');

-- An empty line-up is allowed (a squad can be cleared).
select lives_ok($$select public.save_lineup((select team from fx), '3-5-2', 'balanced', null, '[]')$$, 'empty line-up saves');

-- create_team / limits
select ok((select public.create_team('Hal Reserves', 'crest-03', '#1d4ed8', '#fde68a', (select team from fx))) is not null,
          'create_team copies a squad');
select is((select count(*)::int from public.teams where name = 'Hal Reserves'), 1, 'copy created');
select lives_ok($$select public.create_team('Squad Three'); select public.create_team('Squad Four'); select public.create_team('Squad Five')$$, 'up to 5 squads');
select throws_ok($$select public.create_team('Squad Six')$$, 'P0001', 'TEAM_LIMIT_REACHED', '6th squad rejected');

-- delete_team keeps an active squad and never deletes the last one
select lives_ok($$select public.delete_team((select team from fx))$$, 'active squad deleted');
select is((select count(*)::int from public.teams where is_active), 1, 'another squad became active');
select lives_ok($$select public.delete_team(id) from public.teams where name in ('Squad Three', 'Squad Four', 'Squad Five')$$, 'more squads deleted');
select throws_ok($$select public.delete_team((select id from public.teams limit 1))$$, 'P0001', 'LAST_TEAM', 'last squad cannot be deleted');

select * from finish();
rollback;
