-- =============================================================================
-- Football Legends — Phase 9: account deletion support
--
-- Deleting the auth user cascades through every table (profile → wallet →
-- ledger, cards, squads, stadium, matches, packs, challenges, achievements).
-- The audit log keeps its rows (user ids are opaque UUIDs that no longer
-- resolve to anyone) but loses any personal detail such as the username.
-- =============================================================================

create or replace function private.scrub_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.audit_log
     set details = details - 'username'
   where user_id = old.id and details ? 'username';
  insert into private.audit_log (user_id, action, details) values (old.id, 'account_deleted', '{}'::jsonb);
  return old;
end;
$$;
revoke execute on function private.scrub_deleted_user() from public, anon, authenticated;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.scrub_deleted_user();

-- Account deletion runs through Supabase Auth as role supabase_auth_admin.
-- The cascade fires these triggers as that role, which has no rights on our
-- tables, so the deletion failed ("permission denied for table teams").
-- Trigger functions that read or write other tables therefore run as their
-- owner. (protect_wallet is intentionally NOT changed: it checks current_user.)
alter function private.clear_removed_captain() security definer;
alter function private.protect_ledger() security definer;
alter function private.enforce_captain_in_team() security definer;
alter function private.enforce_team_limit() security definer;
