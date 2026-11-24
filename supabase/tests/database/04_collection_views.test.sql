-- Phase 3 read models respect RLS (security_invoker) and support search.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'finn@example.test', '{"username":"finn"}'),
  ('77777777-7777-7777-7777-777777777777', 'gia@example.test',  '{"username":"gia"}');

select is(public.search_key('Gonçalo Moreirão'), 'goncalo moreirao', 'search key strips accents and case');

-- ------------------------------------------------------------------ anon
set local role anon;
select throws_ok($$select count(*) from public.my_collection$$, '42501', null, 'anon cannot read my_collection');
select throws_ok($$select count(*) from public.card_catalog$$, '42501', null, 'anon cannot read card_catalog');
reset role;

-- ------------------------------------------------------------- as Finn
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select is((select count(*)::int from public.my_collection), 17, 'sees exactly own 17 starter cards');
select is((select count(*)::int from public.my_collection
            where user_id <> '66666666-6666-6666-6666-666666666666'), 0, 'never sees another users cards');
select is((select count(*)::int from public.my_collection where is_starter), 11, 'starting XI flagged');
select ok((select count(*) from public.card_catalog) >= 112, 'full catalogue visible');
select ok(
  (select count(*) from public.card_catalog where search_name like '%' || public.search_key('MOREIRAO') || '%') > 0,
  'accent-insensitive search finds Moreirão');
select is((select count(*)::int from public.card_catalog c
            where c.display_name <> coalesce(c.known_as, c.first_name || ' ' || c.last_name)), 0,
          'display_name is consistent');

reset role;

-- Function privilege audit: API roles may execute only the intended RPCs.
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')),
  null, 'authenticated can execute no private functions');
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not like 'pgtap%' and p.proname not in (select proname from pg_proc pp join pg_depend d on d.objid = pp.oid and d.deptype = 'e')),
  array['is_username_available'], 'anon can execute only is_username_available');

select * from finish();
rollback;
