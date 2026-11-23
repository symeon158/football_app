-- =============================================================================
-- Football Legends — Phase 1: privileges and Row Level Security
--
-- Model:
--   * anon            → no table access at all (must sign in to play).
--   * authenticated   → read public catalogues; read *own* private data;
--                       write only harmless, user-owned fields (profile
--                       cosmetics, team setup). Everything touching coins,
--                       card ownership, stadium levels, matches, challenge
--                       progress goes through SECURITY DEFINER functions.
--   * service_role    → server-side only (never shipped to the browser).
-- =============================================================================

-- Start from zero: Supabase's default privileges grant everything to anon and
-- authenticated on new public tables. We grant back only what is needed.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema private revoke all on functions from public;

-- Enable RLS on every public table (deny-by-default once enabled).
alter table public.profiles              enable row level security;
alter table public.players               enable row level security;
alter table public.player_cards          enable row level security;
alter table public.card_ownership        enable row level security;
alter table public.formation_slots       enable row level security;
alter table public.teams                 enable row level security;
alter table public.team_players          enable row level security;
alter table public.stadiums              enable row level security;
alter table public.stadium_upgrade_costs enable row level security;
alter table public.wallets               enable row level security;
alter table public.coin_transactions     enable row level security;
alter table public.stadium_upgrades      enable row level security;
alter table public.matches               enable row level security;
alter table public.match_events          enable row level security;
alter table public.challenges            enable row level security;
alter table public.user_challenges       enable row level security;
alter table public.achievements          enable row level security;
alter table public.user_achievements     enable row level security;

-- -----------------------------------------------------------------------------
-- Public catalogues: readable by any signed-in user, writable by nobody
-- through the API (managed via migrations / service role).
-- -----------------------------------------------------------------------------
grant select on public.players, public.player_cards, public.formation_slots,
                public.stadium_upgrade_costs, public.challenges, public.achievements
  to authenticated;

create policy "catalogue: authenticated read" on public.players
  for select to authenticated using (true);
create policy "catalogue: authenticated read" on public.player_cards
  for select to authenticated using (true);
create policy "catalogue: authenticated read" on public.formation_slots
  for select to authenticated using (true);
create policy "catalogue: authenticated read" on public.stadium_upgrade_costs
  for select to authenticated using (true);
create policy "catalogue: authenticated read" on public.challenges
  for select to authenticated using (is_active);
create policy "catalogue: authenticated read" on public.achievements
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Profiles: public game identity (username, level) is visible to signed-in
-- users for leaderboards. Only cosmetic columns are user-editable; level/xp
-- are changed only by server functions.
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;

create policy "profiles: authenticated read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Private, read-only-to-owner data.
-- -----------------------------------------------------------------------------
grant select on public.wallets, public.coin_transactions, public.card_ownership,
                public.stadium_upgrades, public.matches, public.match_events,
                public.user_challenges, public.user_achievements
  to authenticated;

create policy "wallets: read own" on public.wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "coin_transactions: read own" on public.coin_transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "card_ownership: read own" on public.card_ownership
  for select to authenticated using (user_id = (select auth.uid()));
create policy "stadium_upgrades: read own" on public.stadium_upgrades
  for select to authenticated using (user_id = (select auth.uid()));
create policy "matches: read own" on public.matches
  for select to authenticated using (user_id = (select auth.uid()));
create policy "match_events: read own" on public.match_events
  for select to authenticated using (
    exists (select 1 from public.matches m
            where m.id = match_events.match_id and m.user_id = (select auth.uid()))
  );
create policy "user_challenges: read own" on public.user_challenges
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_achievements: read own" on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Stadium: owner can read it and rename / restyle it. Level columns are not
-- granted, so they can only change via the paid upgrade function.
-- -----------------------------------------------------------------------------
grant select on public.stadiums to authenticated;
grant update (name, design_template) on public.stadiums to authenticated;

create policy "stadiums: read own" on public.stadiums
  for select to authenticated using (user_id = (select auth.uid()));
create policy "stadiums: update own" on public.stadiums
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Teams: the owner fully manages their squads. Card ownership is guaranteed by
-- composite foreign keys (see core schema), so a user cannot field cards they
-- do not own even with a hand-crafted request.
-- -----------------------------------------------------------------------------
grant select, delete on public.teams to authenticated;
grant insert (name, logo_template, primary_color, secondary_color, formation, tactic,
              captain_ownership_id, user_id)
  on public.teams to authenticated;
grant update (name, logo_template, primary_color, secondary_color, formation, tactic,
              captain_ownership_id)
  on public.teams to authenticated;

create policy "teams: read own" on public.teams
  for select to authenticated using (user_id = (select auth.uid()));
create policy "teams: insert own" on public.teams
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "teams: update own" on public.teams
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "teams: delete own" on public.teams
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.team_players to authenticated;

create policy "team_players: read own" on public.team_players
  for select to authenticated using (user_id = (select auth.uid()));
create policy "team_players: insert own" on public.team_players
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "team_players: update own" on public.team_players
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "team_players: delete own" on public.team_players
  for delete to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Storage: public, read-only bucket for original/licensed game art.
-- Uploads only via service role (no insert/update policies are defined).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-assets', 'game-assets', true, 5242880,
        array['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;
