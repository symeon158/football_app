# Football Legends — Architecture

Status: **Phase 3 complete** (1: setup, schema, auth, security · 2: game shell, dashboard · 3: collection, player profiles, comparison). This document is
updated at the end of each phase.

## 1. Folder structure

```
football_app/
├── web/                          Next.js 16 app (deployed to Vercel, root dir = web)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                  Landing page (static)
│   │   │   ├── (auth)/                   Sign-in / sign-up pages + server actions
│   │   │   ├── (game)/                   Signed-in area: dashboard, and later club,
│   │   │   │                             collection, team, stadium, marketplace, …
│   │   │   └── auth/confirm/route.ts     E-mail confirmation / PKCE callback
│   │   ├── components/
│   │   │   ├── ui/                       shadcn/ui primitives (Base UI)
│   │   │   ├── brand/                    Original logo artwork
│   │   │   ├── shell/                    Sidebar, mobile tab bar + "More" sheet, top bar, user menu
│   │   │   ├── game/                     PlayerCard, TiltCard, Crest, Coins, StadiumIllustration
│   │   │   ├── collection/               Filter bar (URL-driven)
│   │   │   ├── players/                  Attribute meters, comparison chart (Recharts)
│   │   │   └── dashboard/                Dashboard panels
│   │   ├── lib/
│   │   │   ├── supabase/                 client.ts (browser), server.ts (RSC/actions),
│   │   │   │                             proxy.ts (session refresh), admin.ts (server-only)
│   │   │   ├── data/                     Server-only data loaders (RLS-scoped): viewer, dashboard
│   │   │   ├── game/                     Pure, unit-tested rules: progression (XP→level),
│   │   │   │                             team rating, challenge periods, rarity styles
│   │   │   ├── navigation.ts             Single source for all 12 screens + their roadmap phase
│   │   │   ├── validation/               zod schemas shared by forms and actions
│   │   │   ├── env.ts / env.server.ts    Validated configuration (public / secret)
│   │   │   ├── routes.ts                 Protected routes + open-redirect guard
│   │   │   └── errors.ts                 DB error code → user message mapping
│   │   ├── types/database.ts             Generated from the schema (supabase gen types)
│   │   └── proxy.ts                      Next.js proxy (formerly middleware)
│   └── scripts/smoke.mjs                 End-to-end smoke test
├── supabase/
│   ├── config.toml                       Local stack + auth settings
│   ├── migrations/                       Versioned SQL (the source of truth)
│   └── tests/database/                   pgTAP tests (provisioning, economy, RLS)
├── src/football_app/                     Python (uv) tooling: catalogue generator,
│                                         home for future analytics jobs
├── tests/                                Python tests
└── docs/ARCHITECTURE.md
```

Future phases add `web/src/features/<domain>/` (cards, team-builder, stadium, market,
match-engine, challenges) for domain components and logic, keeping `app/` thin.

## 2. Architecture

```
 Browser ──(HTTPS, publishable key + user JWT cookie)──▶ Next.js on Vercel
   │                                                      │  Server Components: read via RLS
   │                                                      │  Server Actions: validate (zod) → RPC
   │                                                      ▼
   └──────────(direct reads, RLS-scoped)──────────▶ Supabase
                                                     ├── Auth (JWT, e-mail/password)
                                                     ├── Postgres
                                                     │    ├── public.*  tables + RLS
                                                     │    ├── public.*  RPCs (SECURITY DEFINER, validate auth.uid())
                                                     │    └── private.* internal helpers, audit log (not exposed)
                                                     └── Storage: game-assets bucket (public read)
```

Principles

1. **The database is the security boundary.** Every rule that protects value — coins, card
   ownership, stadium levels, match results, rewards — is enforced in Postgres (constraints,
   RLS, column grants, SECURITY DEFINER functions). The Next.js layer adds validation and UX,
   but even a hand-crafted API call with the user's own token cannot bypass the rules.
2. **Writes that move value go through one function.** `private.apply_coin_transaction`
   is the only code path that changes a balance. It locks the wallet row, is idempotent per
   `(user_id, idempotency_key)`, refuses negative balances and writes an append-only ledger.
   Future RPCs (`buy_card`, `open_pack`, `upgrade_stadium`, `play_match`, `claim_challenge`)
   compose it inside a single transaction.
3. **Game rules run server-side and deterministically.** The match engine (Phase 7) will be
   a pure TypeScript module with a seeded PRNG, invoked from a server action; the seed and
   engine version are stored on `matches` so every result can be replayed and tested.
4. **Thin pages, typed data.** Pages render; loaders in `lib/data` fetch; generated
   `Database` types keep queries type-safe end to end.
5. **Cache Components.** The app uses Next 16 `cacheComponents`: static shells are
   prerendered, user-specific parts stream in behind `<Suspense>`.

## 2b. UI architecture (Phase 2)

- **Shell**: `(game)/layout.tsx` renders a static shell — sidebar on `lg+`, bottom tab bar
  (Home, Cards, Team, Match, More) on phones/tablets. Only the top-bar status (coins, level,
  avatar) is user-specific and streams behind `<Suspense>`.
- **Data**: `getViewer()` is wrapped in React `cache()` so the top bar and page share one
  profile+wallet query per request. `getDashboard()` runs ten RLS-scoped queries in parallel.
- **Game rules in pure functions** (`lib/game/*`): XP thresholds `50·L·(L−1)`, team overall =
  mean effective rating of the XI (100 % natural position, 90 % related, 75 % other, 30 % GK
  mismatch; empty slots count 0), UTC daily/ISO-week challenge buckets. Phase 4/7/8 server code
  reuses these so the UI and the server agree.
- **Cards**: `PlayerCard` uses CSS container queries so text scales with card width; rarity
  visuals come from one table (`RARITY_STYLE`); hover sheen respects `prefers-reduced-motion`.
- **Responsive rules**: grids declare `grid-cols-1` on mobile (a `minmax(0,1fr)` track) so wide
  children like the swipeable card strip cannot widen the page; verified at 390, 820 and 1440 px.
- Screens from later phases render a "Coming soon" state, so navigation never dead-ends.

## 2c. Cards, collection and profiles (Phase 3)

- **Read models** (`20261124000100_collection_views.sql`): `card_catalog` (card + player bio,
  flattened) and `my_collection` (owned copies + catalogue + `is_starter`). Both are
  `security_invoker`, so RLS on the base tables still decides what a caller sees.
  `public.search_key()` gives accent-insensitive search ("moreirao" finds "Moreirão"), indexed.
- **Collection** (`/collection`): filters live in the URL (search, position, rarity, nation,
  sort, page) and are parsed with zod; tampered values fall back to defaults. Works as a plain
  GET form without JS; with JS, selects apply instantly and search is debounced.
- **Player profile** (`/players/[id]`): tilting card, attribute *meter list* (one hue — values
  are magnitudes), info, biography, career table, copies owned.
- **Compare** (`/players/compare?ids=a,b,c`): Recharts grouped horizontal bars. Series colours
  are categorical slots 1–3, validated against our surface (CVD ΔE ≥ 9.4, contrast ≥ 3:1), with a
  legend and a head-to-head table as the accessible data view (best value marked ▲, not colour).

### Framework rules learned in Phase 3 (keep these)

1. **Session work never runs in prefetches.** `(game)/layout.tsx` sets
   `ensureStatic = "prefetch"` and `requireUserId()` awaits `navigation()`. Without this, every
   visible `<Link>` triggered a *runtime prefetch* — a full authenticated render with DB queries
   (~17 per page view) — which queued real navigations behind it.
2. **Supabase server clients are only created at request time.** `createClient()` awaits
   `connection()` first. `createServerClient()` starts a detached auth task that calls
   `Date.now()`; inside a prerender phase Next.js rejects that and the streamed page never
   finishes (observed as pages stuck after the static shell).
3. **Path-dependent client UI goes behind `<Suspense>`.** The navs read `usePathname()`, which is
   request-time data on dynamic routes; they render a static, highlight-free fallback.

### Database privilege hardening

Supabase's global default privileges grant EXECUTE on every new function to `anon` and
`authenticated` in *every* schema, and a schema-level revoke cannot override them. Phase 3 revokes
EXECUTE on all `private` functions explicitly and changes the defaults for that schema; every new
`public` function must revoke from `anon`/`public` itself. `tests/database/04` audits this: it
fails if `authenticated` can execute anything in `private`, or `anon` anything in `public` except
`is_username_available`.

## 3. Database schema

All tables live in `public` with RLS enabled, except `private.audit_log`.

| Table | Purpose | Key constraints |
|---|---|---|
| `profiles` | Public game identity (1:1 `auth.users`) | `username` citext unique, regex check; `level`/`xp` ≥ 0 |
| `players` | Footballer bio (fictional or licensed) | ISO country code; `license_ref` required when `is_fictional = false` |
| `player_cards` | Collectible card edition: rarity + 6 face stats | all ratings 0–99, weak foot / skills 1–5, `unique(player_id, edition)` |
| `card_ownership` | A user's copy of a card (duplicates allowed) | FK user + card; `unique(id, user_id)` for composite FKs |
| `formation_slots` | Positions + pitch coordinates for each formation | PK `(formation, slot)` |
| `teams` | Saved squads (max 5, one active) | partial unique index on active; captain FK `(captain, user_id)` → ownership |
| `team_players` | Card in a squad slot (0–10 XI, 11–22 bench) | composite FKs `(team_id,user_id)` and `(ownership_id,user_id)` ⇒ **you can only field cards you own** |
| `stadiums` | One per user; level per category 1–5 | `capacity`, `stadium_level` are generated columns |
| `stadium_upgrade_costs` | Price list + match bonus per level | PK `(category, level)` |
| `stadium_upgrades` | History of paid upgrades | FK to the paying `coin_transactions` row |
| `wallets` | Current balance | `balance >= 0`; no client UPDATE grant; trigger blocks non-owner edits |
| `coin_transactions` | Append-only ledger | `amount <> 0`, `balance_after >= 0`, `unique(user_id, idempotency_key)`; update/delete blocked |
| `matches` / `match_events` | Simulated matches + timeline | seed + engine version for replay; events unique `(match_id, seq)` |
| `challenges` / `user_challenges` | Daily, weekly, team-building, milestone | progress per `(user, challenge, period_start)`; claim requires completion |
| `achievements` / `user_achievements` | Badges | PK `(user, achievement)` prevents double unlock |

Indexes cover every foreign key used in lookups plus marketplace filters
(`player_cards (position, rarity, overall desc)`, nationality, club) and per-user timelines.

**New accounts** (trigger `on_auth_user_created`): profile, wallet funded with 1,000 FC via the
ledger (`signup_bonus`), stadium (5,000 seats), an active 4-3-3 team with one common card in each
natural position, five bench commons and one rare (17 cards), captain = best starter.

**Catalogue**: 112 fictional players/cards generated deterministically by
`uv run football-app generate-catalog` (Python). Licensed real-world data can be added later as
rows with `is_fictional = false`, `data_source` and a mandatory `license_ref`.

## 4. API surface (server actions and RPCs)

Implemented in Phase 1

| Kind | Name | Notes |
|---|---|---|
| Server action | `signUp`, `signIn`, `signOut` | zod-validated; generic error messages (no account enumeration) |
| Route handler | `GET /auth/confirm` | verifies e-mail OTP / PKCE code; `next` param sanitised |
| RPC | `is_username_available(text)` | callable by anon (usernames are public) |
| RPC | `set_active_team(uuid)` | owner-checked |
| Direct (RLS) | read catalogue, own wallet/ledger/cards/teams/stadium/matches; edit profile cosmetics, stadium name/design, team CRUD | column-level grants limit what can be written |

Planned (each a SECURITY DEFINER RPC called from a server action, one DB transaction):

| Phase | RPC |
|---|---|
| 4 | `save_lineup(team_id, slots[])` — atomic lineup replace + chemistry/overall calc |
| 5 | `buy_card(card_id, idempotency_key)`, `open_pack(pack_id, idempotency_key)` (published odds) |
| 6 | `upgrade_stadium(category, idempotency_key)` |
| 7 | `record_match(...)` — server action runs the deterministic engine, RPC persists result + reward |
| 8 | `claim_challenge(...)`, `claim_achievement(...)`, leaderboard views |

## 5. Authentication and security

- **Supabase Auth** with e-mail + password (min 8, letters + digits). E-mail confirmation is off
  locally for speed; **enable it in production** (Auth → Providers → Email).
- **Sessions** live in HTTP cookies managed by `@supabase/ssr`. `src/proxy.ts` refreshes them on
  every request. Identity on the server is always taken from `auth.getClaims()` (signature-verified
  JWT), never from `getSession()` or a request parameter.
- **Route protection** is layered: the proxy redirects anonymous users (UX), every protected
  page calls `requireUserId()` (authoritative), and RLS protects the data regardless.
- **Keys**: only the publishable key is shipped to the browser. The secret key is read in
  `env.server.ts`/`admin.ts`, both marked `server-only` (build fails if imported client-side);
  the smoke test confirms it is absent from the client bundle.
- **Least privilege**: `anon` has no table access. `authenticated` has SELECT on catalogues and
  own rows, and UPDATE only on cosmetic columns. All default Supabase grants are revoked first.
  Internal functions live in `private`, which is not exposed through the Data API.
- **Integrity**: CHECK constraints, composite FKs for ownership, append-only ledger, row-locked
  idempotent coin movements, unique constraints against double-claims, audit log.
- **Input validation**: zod on every server action, mirrored by DB constraints.
- **Privacy**: e-mail and auth data remain in `auth.users`; `profiles` contains only public
  game identity used for leaderboards.
- **No real money / gambling**: coins are only earned through gameplay; packs will show
  published, fixed probabilities.
