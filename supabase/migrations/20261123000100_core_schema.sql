-- =============================================================================
-- Football Legends — Phase 1: core schema
-- Types, tables, constraints and indexes. Security (RLS, grants) lives in the
-- next migration; game logic functions in the one after that.
-- =============================================================================

create extension if not exists citext with schema extensions;

-- Internal schema: never exposed through the Data API (see config.toml
-- [api].schemas). Holds SECURITY DEFINER helpers and the audit log.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.player_position as enum (
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'
);
create type public.card_rarity as enum ('common', 'rare', 'epic', 'legendary', 'icon');
create type public.preferred_foot as enum ('left', 'right');
create type public.formation_code as enum ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1');
create type public.match_tactic as enum ('balanced', 'attacking', 'defensive');
create type public.acquisition_source as enum ('starter', 'pack', 'market', 'reward');
create type public.coin_tx_type as enum (
  'signup_bonus', 'match_reward', 'challenge_reward', 'achievement_reward',
  'card_purchase', 'pack_purchase', 'stadium_upgrade', 'admin_adjustment'
);
create type public.stadium_upgrade_category as enum ('seating', 'lighting', 'pitch', 'facilities');
create type public.match_status as enum ('in_progress', 'completed', 'abandoned');
create type public.match_side as enum ('home', 'away');
create type public.match_event_type as enum (
  'kickoff', 'goal', 'own_goal', 'chance', 'save', 'yellow_card', 'red_card',
  'substitution', 'injury', 'half_time', 'full_time'
);
create type public.challenge_period as enum ('daily', 'weekly', 'team_building', 'milestone');

-- Shared trigger to maintain updated_at columns.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Contains only public-safe data: e-mail and
-- other PII stay in auth.users, which is not exposed.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      extensions.citext not null unique
                check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name  text check (char_length(display_name) between 1 and 40),
  avatar_key    text not null default 'avatar-01'
                check (avatar_key ~ '^avatar-[0-9]{2}$'),
  level         integer not null default 1 check (level >= 1),
  xp            bigint  not null default 0 check (xp >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Player catalogue. `players` = the footballer (bio data); `player_cards` = a
-- collectible card edition of that footballer with ratings and rarity.
-- Licensing columns allow real, licensed data to be added later alongside the
-- fictional sample set.
-- -----------------------------------------------------------------------------
create table public.players (
  id              uuid primary key default gen_random_uuid(),
  first_name      text not null check (char_length(first_name) between 1 and 40),
  last_name       text not null check (char_length(last_name) between 1 and 40),
  known_as        text check (char_length(known_as) between 1 and 40),
  nationality     char(2) not null check (nationality ~ '^[A-Z]{2}$'), -- ISO 3166-1 alpha-2
  birth_date      date not null check (birth_date > '1900-01-01'),
  club            text not null check (char_length(club) between 1 and 60),
  primary_position public.player_position not null,
  height_cm       smallint check (height_cm between 140 and 220),
  biography       text not null default '',
  career_summary  jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(career_summary) = 'array'),
  image_path      text,                              -- object key in Storage bucket `game-assets`
  is_fictional    boolean not null default true,
  data_source     text not null default 'football-legends-fictional',
  license_ref     text,                              -- required for non-fictional players
  created_at      timestamptz not null default now(),
  constraint players_license_required check (is_fictional or license_ref is not null)
);
create index players_nationality_idx on public.players (nationality);
create index players_club_idx on public.players (club);

create table public.player_cards (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players (id) on delete restrict,
  edition         text not null default 'base' check (char_length(edition) between 1 and 40),
  rarity          public.card_rarity not null,
  position        public.player_position not null,
  overall         smallint not null check (overall between 0 and 99),
  pace            smallint not null check (pace between 0 and 99),
  shooting        smallint not null check (shooting between 0 and 99),
  passing         smallint not null check (passing between 0 and 99),
  dribbling       smallint not null check (dribbling between 0 and 99),
  defending       smallint not null check (defending between 0 and 99),
  physicality     smallint not null check (physicality between 0 and 99),
  weak_foot       smallint not null check (weak_foot between 1 and 5),
  skill_moves     smallint not null check (skill_moves between 1 and 5),
  preferred_foot  public.preferred_foot not null,
  market_price    integer not null check (market_price >= 0),  -- in Football Coins
  is_purchasable  boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (player_id, edition)
);
create index player_cards_player_idx   on public.player_cards (player_id);
create index player_cards_filter_idx   on public.player_cards (position, rarity, overall desc);
create index player_cards_overall_idx  on public.player_cards (overall desc);

-- A user's owned copy of a card. Duplicates are separate rows.
create table public.card_ownership (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  card_id       uuid not null references public.player_cards (id) on delete restrict,
  acquired_via  public.acquisition_source not null,
  upgrade_level smallint not null default 0 check (upgrade_level between 0 and 5),
  acquired_at   timestamptz not null default now(),
  unique (id, user_id)            -- target for composite FKs that pin ownership
);
create index card_ownership_user_idx on public.card_ownership (user_id, acquired_at desc);
create index card_ownership_card_idx on public.card_ownership (card_id);

-- -----------------------------------------------------------------------------
-- Formations reference: which position each of the 11 starting slots plays,
-- plus pitch coordinates (0-100) for the team-builder UI.
-- -----------------------------------------------------------------------------
create table public.formation_slots (
  formation  public.formation_code not null,
  slot       smallint not null check (slot between 0 and 10),
  position   public.player_position not null,
  x          smallint not null check (x between 0 and 100),
  y          smallint not null check (y between 0 and 100),
  primary key (formation, slot)
);

-- -----------------------------------------------------------------------------
-- Teams (saved squads) and their players.
-- -----------------------------------------------------------------------------
create table public.teams (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                 text not null check (char_length(btrim(name)) between 3 and 30),
  logo_template        text not null default 'crest-01' check (logo_template ~ '^crest-[0-9]{2}$'),
  primary_color        text not null default '#16a34a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color      text not null default '#f8fafc' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  formation            public.formation_code not null default '4-3-3',
  tactic               public.match_tactic not null default 'balanced',
  captain_ownership_id uuid,
  is_active            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  -- The captain must be a card owned by the same user.
  constraint teams_captain_owned_fk foreign key (captain_ownership_id, user_id)
    references public.card_ownership (id, user_id) on delete set null (captain_ownership_id)
);
create index teams_user_idx on public.teams (user_id);
create unique index teams_one_active_per_user on public.teams (user_id) where is_active;
create trigger teams_touch before update on public.teams
  for each row execute function private.touch_updated_at();

-- Slots 0-10 = starting XI (see formation_slots), 11-22 = substitutes.
-- user_id is denormalised so composite FKs can guarantee that the team and
-- the card belong to the same user — ownership is enforced by the database.
create table public.team_players (
  team_id       uuid not null,
  user_id       uuid not null default auth.uid(),
  ownership_id  uuid not null,
  slot          smallint not null check (slot between 0 and 22),
  primary key (team_id, slot),
  unique (team_id, ownership_id),
  foreign key (team_id, user_id) references public.teams (id, user_id) on delete cascade,
  foreign key (ownership_id, user_id) references public.card_ownership (id, user_id) on delete cascade
);
create index team_players_ownership_idx on public.team_players (ownership_id);
create index team_players_user_idx on public.team_players (user_id);

-- -----------------------------------------------------------------------------
-- Stadiums. One per user. Level columns are only changed by server functions;
-- capacity and overall level are derived.
-- -----------------------------------------------------------------------------
create table public.stadiums (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 3 and 40),
  design_template  text not null default 'classic' check (design_template in ('classic', 'modern', 'bowl', 'fortress')),
  seating_level    smallint not null default 1 check (seating_level between 1 and 5),
  lighting_level   smallint not null default 1 check (lighting_level between 1 and 5),
  pitch_level      smallint not null default 1 check (pitch_level between 1 and 5),
  facilities_level smallint not null default 1 check (facilities_level between 1 and 5),
  capacity integer generated always as (
    case seating_level when 1 then 5000 when 2 then 12000 when 3 then 25000
                       when 4 then 45000 else 70000 end
  ) stored,
  stadium_level smallint generated always as (
    ((seating_level + lighting_level + pitch_level + facilities_level) / 4)::smallint
  ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger stadiums_touch before update on public.stadiums
  for each row execute function private.touch_updated_at();

-- Price list: cost to reach `level` in a category, and the match bonus it gives.
create table public.stadium_upgrade_costs (
  category    public.stadium_upgrade_category not null,
  level       smallint not null check (level between 2 and 5),
  cost        integer  not null check (cost > 0),
  bonus_pct   numeric(4,2) not null check (bonus_pct between 0 and 10),
  description text not null,
  primary key (category, level)
);

-- -----------------------------------------------------------------------------
-- Economy: wallets + append-only ledger. Balance can never go negative and
-- each (user, idempotency_key) can only be applied once.
-- -----------------------------------------------------------------------------
create table public.wallets (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  balance     bigint not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

create table public.coin_transactions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.wallets (user_id) on delete cascade,
  amount           bigint not null check (amount <> 0),
  balance_after    bigint not null check (balance_after >= 0),
  tx_type          public.coin_tx_type not null,
  reference_type   text check (char_length(reference_type) <= 40),
  reference_id     uuid,
  idempotency_key  text not null check (char_length(idempotency_key) between 8 and 120),
  created_at       timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index coin_transactions_user_idx on public.coin_transactions (user_id, created_at desc);

-- Applied stadium upgrades (history; ties each upgrade to its payment).
create table public.stadium_upgrades (
  id                  bigint generated always as identity primary key,
  stadium_id          uuid not null references public.stadiums (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  category            public.stadium_upgrade_category not null,
  from_level          smallint not null,
  to_level            smallint not null,
  cost                integer not null check (cost > 0),
  coin_transaction_id bigint not null unique references public.coin_transactions (id),
  created_at          timestamptz not null default now(),
  check (to_level = from_level + 1)
);
create index stadium_upgrades_stadium_idx on public.stadium_upgrades (stadium_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Matches. Created and resolved only by the server-side engine (Phase 7).
-- `seed` makes every simulation reproducible.
-- -----------------------------------------------------------------------------
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  team_id         uuid references public.teams (id) on delete set null,
  team_snapshot   jsonb not null default '{}'::jsonb,   -- line-up at kick-off
  opponent_name   text not null,
  opponent_rating smallint not null check (opponent_rating between 0 and 99),
  tactic          public.match_tactic not null,
  seed            bigint not null,
  engine_version  text not null,
  status          public.match_status not null default 'in_progress',
  home_score      smallint not null default 0 check (home_score >= 0),
  away_score      smallint not null default 0 check (away_score >= 0),
  stats           jsonb not null default '{}'::jsonb,
  reward_coins    integer not null default 0 check (reward_coins >= 0),
  xp_gained       integer not null default 0 check (xp_gained >= 0),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);
create index matches_user_idx on public.matches (user_id, created_at desc);

create table public.match_events (
  id                  bigint generated always as identity primary key,
  match_id            uuid not null references public.matches (id) on delete cascade,
  seq                 smallint not null check (seq >= 0),
  minute              smallint not null check (minute between 0 and 130),
  event_type          public.match_event_type not null,
  side                public.match_side,
  player_name         text,
  assist_player_name  text,
  ownership_id        uuid references public.card_ownership (id) on delete set null,
  assist_ownership_id uuid references public.card_ownership (id) on delete set null,
  detail              text,
  unique (match_id, seq)
);

-- -----------------------------------------------------------------------------
-- Challenges and achievements (catalogues + per-user progress).
-- -----------------------------------------------------------------------------
create table public.challenges (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[a-z0-9_]{3,60}$'),
  title         text not null,
  description   text not null,
  period        public.challenge_period not null,
  metric        text not null check (metric ~ '^[a-z_]{3,40}$'),
  target        integer not null check (target > 0),
  reward_coins  integer not null default 0 check (reward_coins >= 0),
  reward_xp     integer not null default 0 check (reward_xp >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.user_challenges (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  period_start  date not null,                 -- day/week bucket; '1970-01-01' for one-off
  progress      integer not null default 0 check (progress >= 0),
  completed_at  timestamptz,
  claimed_at    timestamptz,
  primary key (user_id, challenge_id, period_start),
  check (claimed_at is null or completed_at is not null)
);
create index user_challenges_user_idx on public.user_challenges (user_id, period_start desc);

create table public.achievements (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[a-z0-9_]{3,60}$'),
  title         text not null,
  description   text not null,
  badge_icon    text not null,
  metric        text not null check (metric ~ '^[a-z_]{3,40}$'),
  target        integer not null check (target > 0),
  reward_coins  integer not null default 0 check (reward_coins >= 0),
  reward_xp     integer not null default 0 check (reward_xp >= 0),
  created_at    timestamptz not null default now()
);

create table public.user_achievements (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  achievement_id  uuid not null references public.achievements (id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  claimed_at      timestamptz,
  primary key (user_id, achievement_id)
);

-- -----------------------------------------------------------------------------
-- Audit log for important game actions (not exposed via the API).
-- -----------------------------------------------------------------------------
create table private.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_user_idx on private.audit_log (user_id, created_at desc);
