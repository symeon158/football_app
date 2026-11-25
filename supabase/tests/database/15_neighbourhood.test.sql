-- Neighbourhoods: area names, who may set them, the area table and derby lookups.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('abababab-0000-0000-0000-000000000001', 'kos@example.test', '{"username":"kos"}'),
  ('abababab-0000-0000-0000-000000000002', 'mel@example.test', '{"username":"mel"}'),
  ('abababab-0000-0000-0000-000000000003', 'dio@example.test', '{"username":"dio"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$update public.stadiums set area = 'Δοκιμούπολη' where user_id = auth.uid()$$, 'a manager can set a Greek area name');
select is((select area from public.stadiums where user_id = auth.uid()), 'Δοκιμούπολη', 'the area is stored');
select throws_ok($$update public.stadiums set area = '<script>' where user_id = auth.uid()$$, '23514', null, 'symbols are rejected');
select throws_ok($$update public.stadiums set area = 'K' where user_id = auth.uid()$$, '23514', null, 'too short is rejected');
select throws_ok($$update public.stadiums set seating_level = 5 where user_id = auth.uid()$$, '42501', null, 'levels still cannot be changed directly');
update public.stadiums set area = 'Kypseli' where user_id = 'abababab-0000-0000-0000-000000000002'; -- RLS: not their row, no effect
select is((select count(*)::int from public.stadiums where area is not null), 1, 'nobody can set another club''s area');
reset role;

update public.stadiums set area = 'δοκιμούπολη' where user_id = 'abababab-0000-0000-0000-000000000002';
update public.stadiums set area = 'Testville' where user_id = 'abababab-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select managers from public.get_area_table('all') where lower(area) = 'δοκιμούπολη'), 2::bigint, 'areas group case-insensitively');
select is((select is_mine from public.get_area_table('all') where lower(area) = 'δοκιμούπολη'), true, 'the viewer''s area is marked');
select is(public.get_manager_area('dio'), 'Testville', 'another manager''s area can be looked up for derbies');
reset role;

set local role anon;
select throws_ok($$select * from public.get_area_table('week')$$, '42501', null, 'anonymous visitors cannot read the area table');
reset role;

select * from finish();
rollback;
