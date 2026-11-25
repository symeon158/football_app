-- Phase 9: schema-wide security audit. These assertions cover the whole
-- database, so a future migration that forgets RLS, a search_path, or grants
-- too much will fail CI instead of shipping.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1. RLS everywhere in public.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, 'every public table has row level security enabled');

-- 2. SECURITY DEFINER functions must pin search_path (prevents search-path hijacking).
select is(
  (select array_agg(n.nspname || '.' || p.proname order by n.nspname || '.' || p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  null, 'every SECURITY DEFINER function sets search_path');

-- 3. Anonymous visitors have no table privileges at all.
select is(
  (select array_agg(distinct table_name::text) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  null, 'anon has no privileges on public tables');

-- 4. Signed-in users cannot write to tables that hold value.
select is(
  (select array_agg(distinct table_name || ':' || privilege_type order by table_name || ':' || privilege_type) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and table_name in ('wallets', 'coin_transactions', 'card_ownership', 'matches', 'match_events', 'user_challenges',
                         'user_achievements', 'pack_openings', 'stadium_upgrades', 'team_players', 'player_cards', 'players',
                         'card_packs', 'card_pack_odds', 'challenges', 'achievements', 'stadium_upgrade_costs', 'formation_slots')),
  null, 'no write privileges on value-bearing or catalogue tables');

-- 5. The only columns signed-in users may update are cosmetic.
select results_eq(
  $$select (table_name::text || '.' || column_name::text) collate "default" from information_schema.column_privileges
     where grantee = 'authenticated' and privilege_type = 'UPDATE' and table_schema = 'public' order by 1$$,
  $$values ('profiles.avatar_key'), ('profiles.display_name'), ('stadiums.area'), ('stadiums.design_template'), ('stadiums.name'),
           ('teams.logo_template'), ('teams.name'), ('teams.primary_color'), ('teams.secondary_color')$$,
  'updatable columns are exactly the cosmetic ones');
select is(
  (select array_agg(table_name::text) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'DELETE')),
  null, 'signed-in users cannot insert or delete rows directly anywhere');

-- 6. Views run with the caller's rights (RLS applies through them).
select is(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  null, 'all public views are security_invoker');

-- 7. Private schema is unreachable from the API roles.
select ok(not has_schema_privilege('anon', 'private', 'usage') and not has_schema_privilege('authenticated', 'private', 'usage'),
          'private schema is not usable by API roles');
select is(
  (select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  null, 'no private function is executable by API roles');

-- 8. Results can only be recorded by the server.
select ok(not has_function_privilege('authenticated', 'public.record_match(uuid, uuid, text, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.record_match(uuid, uuid, text, jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.record_match(uuid, uuid, text, jsonb)', 'execute'),
          'record_match is service-role only');

-- 9. Storage: public game art bucket, no client-side uploads.
select ok((select public from storage.buckets where id = 'game-assets'), 'game-assets bucket is public-read');
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and (roles && array['authenticated', 'anon', 'public']::name[])),
  0, 'no storage write policies for clients');

select * from finish();
rollback;
