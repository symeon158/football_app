-- =============================================================================
-- Football Legends — Phase 3: read models for cards, collection and profiles
--
-- Both views are SECURITY INVOKER, so the caller's RLS on the underlying
-- tables still applies: `my_collection` can only ever show the caller's own
-- cards, and anon (no grants on the base tables) sees nothing.
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Hardening: Supabase's global default privileges grant EXECUTE on every new
-- function to anon/authenticated in *every* schema. Until now `private` was
-- protected only by schema USAGE. Make function privileges explicit too, so
-- private helpers stay uncallable even if schema access ever changes.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

-- Same global defaults leaked set_active_team to anon (harmless: it rejects a
-- null auth.uid(), but least privilege). Schema-level default revokes cannot
-- override global ones, so every new public function must revoke explicitly;
-- tests/database/04 audits this.
revoke execute on function public.set_active_team(uuid) from public, anon;

-- Accent- and case-insensitive search key ("Moreirão" → "moreirao").
-- Pure and harmless, so it lives in public (views run it as the caller).
-- An explicit dictionary makes unaccent safe to mark IMMUTABLE for indexing.
create or replace function public.search_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, '')));
$$;
revoke execute on function public.search_key(text) from public, anon;
grant execute on function public.search_key(text) to authenticated;

-- Flattened catalogue: one row per card edition with its player's bio fields.
create view public.card_catalog
with (security_invoker = true) as
select
  pc.id            as card_id,
  pc.player_id,
  pc.edition,
  pc.rarity,
  pc.position,
  pc.overall,
  pc.pace, pc.shooting, pc.passing, pc.dribbling, pc.defending, pc.physicality,
  pc.weak_foot,
  pc.skill_moves,
  pc.preferred_foot,
  pc.market_price,
  pc.is_purchasable,
  p.first_name,
  p.last_name,
  p.known_as,
  coalesce(p.known_as, p.first_name || ' ' || p.last_name) as display_name,
  public.search_key(coalesce(p.known_as, p.first_name || ' ' || p.last_name)) as search_name,
  p.nationality,
  p.birth_date,
  p.club,
  p.height_cm,
  p.biography,
  p.career_summary,
  p.image_path,
  p.is_fictional
from public.player_cards pc
join public.players p on p.id = pc.player_id;

-- The caller's owned copies, with catalogue fields and squad status.
create view public.my_collection
with (security_invoker = true) as
select
  co.id           as ownership_id,
  co.user_id,
  co.acquired_at,
  co.acquired_via,
  co.upgrade_level,
  exists (
    select 1
      from public.team_players tp
      join public.teams t on t.id = tp.team_id
     where tp.ownership_id = co.id and t.is_active and tp.slot <= 10
  ) as is_starter,
  c.card_id, c.player_id, c.rarity, c.position, c.overall,
  c.pace, c.shooting, c.passing, c.dribbling, c.defending, c.physicality,
  c.weak_foot, c.skill_moves, c.preferred_foot, c.market_price,
  c.first_name, c.last_name, c.known_as, c.display_name, c.search_name,
  c.nationality, c.club, c.image_path
from public.card_ownership co
join public.card_catalog c on c.card_id = co.card_id;

grant select on public.card_catalog, public.my_collection to authenticated;

-- Supports name search on the catalogue (used by the Phase 5 marketplace too).
create index players_search_idx on public.players
  (public.search_key(coalesce(known_as, first_name || ' ' || last_name)));
