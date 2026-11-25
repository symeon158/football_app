# Football Legends — Architecture

Status: **All 9 phases complete.** Deployment: see `DEPLOYMENT.md`; launch readiness: `LAUNCH_CHECKLIST.md`. This document is
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

## 2d. Team builder and squads (Phase 4)

- **One write path for line-ups.** `save_lineup(team, formation, tactic, captain, slots)` replaces a
  squad atomically (team row locked) after checking: caller owns the squad and every card, slots
  0–22 unique, one copy of each player, captain in the starting XI. `create_team` (optional copy of
  another squad; 5-squad limit) and `delete_team` (never the last; re-activates another) complete
  the set. Direct client INSERT/UPDATE/DELETE on `team_players` and on lineup columns of `teams` is
  revoked; only identity columns (name, crest, colours) stay directly editable under RLS.
- **Rules in pure TypeScript** (`lib/game/lineup.ts`, unit-tested): chemistry per starter =
  position fit (natural 4 · related 2 · other 0) + club links (1 → 2, 2+ → 3) + nation links
  (1/2/3+ → 1/2/3), max 10; team chemistry = total ÷ 110 as 0–100, empty slots count 0. Also line
  ratings (GK/DEF/MID/ATT), `placeCard` (swap / replace / one copy per player), `autoPick` (greedy
  best effective rating, deterministic) and `validateLineup` (mirrors the RPC's checks).
- **UI** (`/team`): pitch drawn from `formation_slots` coordinates; drag-and-drop via `@dnd-kit/core`
  (pointer, touch with a press delay, keyboard) and tap-to-select as an equal alternative; live
  rating, chemistry and warnings; captain, tactic, formation; unsaved-change guard and a sticky save
  bar on phones. `/club` manages squads (create/copy, rename, crest template + colours, set active,
  delete).
- The builder is keyed by squad id only: after a save the refreshed server state equals local state,
  so it doesn't remount (remounting dropped the "Line-up saved." confirmation).

## 2e. Economy, marketplace and packs (Phase 5)

- **Purchases are single DB transactions.** `buy_card(card, key)` and `open_pack(pack, key)` charge
  through `private.apply_coin_transaction` and grant cards in the same transaction. Price,
  balance, availability, a 500-card collection cap and per-pack daily limits are decided in the
  database; the server actions only validate input shape.
- **Idempotent by design.** The client creates one key per purchase *intent* (reused on retry).
  The ledger's `unique(user_id, idempotency_key)` plus `card_ownership.coin_transaction_id unique`
  and `pack_openings.coin_transaction_id unique` mean a double-click, replay or concurrent duplicate
  returns the original result and is never charged twice (verified via the real UI by
  double-clicking Confirm).
- **Transparent odds.** `card_pack_odds` (basis points, sum = 10,000 per pack — tested) is both shown
  on the Packs page and read by `private.draw_rarity`; a pgTAP test checks 20,000 draws against the
  published odds. Each pack's guarantee applies to its first card. Coins are earned only through
  play; there are no real-money purchases.
- **History.** `/marketplace/history` renders the append-only ledger with readable descriptions.
- Server actions that redirect must `refresh()` first, otherwise the preserved layout (top-bar
  coin balance) stays stale.

## 2f. Stadium builder (Phase 6)

- `upgrade_stadium(category, expected_level, key)` is the only way a level changes: one transaction
  that locks the stadium row, checks the caller's expected level (`STADIUM_LEVEL_CHANGED` instead of
  charging for a level the player didn't see), charges through `apply_coin_transaction`, raises the
  level and logs `stadium_upgrades`. Idempotent per client key. Name and design stay directly
  editable (column grants); levels are not.
- Rules in `lib/game/stadium.ts` (tested): capacity table mirrors the generated column; stadium
  level = floored average; **home advantage** = sum of the reached levels' `bonus_pct` (0–15%);
  **matchday income** = capacity ÷ 100 FC per home match. Both feed the Phase 7 engine.
- The illustration grows per category (tiers, floodlights, turf, roof/buildings) in four original
  designs (classic, modern, bowl, fortress).

### Reliability rules learned in Phase 6 (keep these)

1. **Never import a constant from a `"use client"` module into server code** — the server receives a
   client *reference*, not the value, with no build or type error. It crashed the stadium history and
   had silently blanked the compare-page colours since Phase 3. `npm run check:boundaries` enforces it.
2. **Every game page has an error boundary** (`(game)/error.tsx`, with retry) and the layout's top bar
   degrades to a placeholder instead of throwing (`unstable_rethrow` keeps redirects/bailouts working).
   Verified by stopping the REST container: the shell stays, the error page shows, "Try again" recovers.
3. **Every server-side Supabase request has a 10 s timeout** (`fetchWithTimeout`), so nothing can hang a
   render; timed-out writes are safe to retry because they are idempotent.
4. Local-dev note: on Windows + Docker Desktop, requests from the Next server to the local gateway
   occasionally take several seconds in bursts (measured: time spent waiting for response headers,
   while Postgres is idle and direct REST calls stay ~100 ms). This explains the sporadic slow loads
   seen since Phase 3; it is environmental, not application logic.

## 2g. Match engine (Phase 7)

**Trust boundary.** The engine (`lib/engine/`) runs only on the server. The `kickOff` server action
identifies the user from the verified session, reads *their* squad/cards/stadium through RLS,
generates a seed with `crypto`, simulates, and stores the result with `record_match()` — which only
the **service role** may execute (`createAdminClient`, secret key server-only). Signed-in users
cannot call it, insert matches, or edit XP. `record_match` itself validates the payload (score must
equal the goal events, enums, sizes), links events only to cards the user owns, and **decides the
rewards**: `match_rewards()` (win/draw/loss × difficulty 0.75/1/1.5) + 10 FC per goal (max 50) +
stadium matchday income; XP → `level_for_xp()` (mirrors `progression.ts`, tested). Limits: 5 s
cooldown, 60 matches/day, rewards for the first 30/day. Kick-off is idempotent (server-rendered key
per form), so double submits return the same match.

**Determinism.** `Rng` (mulberry32) is the only source of randomness; `simulateMatch(input)` is pure.
The full input (both team sheets, seed, home bonus) is stored in `matches.team_snapshot`; every match
page re-simulates it and shows **Verified replay** when the result is identical. Changing the engine
means bumping `ENGINE_VERSION`.

**Model.** Per minute: possession from midfield strength (logistic), chance probability from attack ÷
defence, shot quality (xG), on-target and finishing vs goalkeeper; cards (second yellow → red, rare
straight reds), up to 3 AI substitutions per side, red cards weaken a side. Inputs: effective ratings
(out-of-position penalty), formation lines, chemistry (×0.9–1.1), captain (+1%), tactic, and a fifth of
the stadium's home bonus. Calibrated over thousands of matches (`calibrate.test.ts`): equal teams ≈
2.6 goals, 37/25/38 W/D/L; +6 rating ≈ 61% wins; maxed stadium ≈ +8 points of win rate; ≈21 shots,
3.1 yellows, 0.18 reds per match. Tests assert these ranges plus invariants over 300 matches.

**Match screen.** Live-style replay of the stored timeline (clock, score, 1×/4×, skip), then stats,
player ratings, man of the match and rewards. The top bar's coins/level are masked during a live
replay (`data-match-live`) so the reward can't spoil the result.

## 2h. Challenges, achievements, leaderboards, profiles (Phase 8)

- **Progress is derived, not counted.** `private.metric_value(user, metric, from, to)` computes every
  metric from authoritative data at read time: matches played/won, goals and clean sheets in the
  period window; cards owned (all / rare+ / legendary+); stadium level; manager level; best squad
  rating and chemistry. Nothing to drift or tamper with. Periods: daily (UTC day), weekly (ISO week),
  one-off (team-building, milestones).
- **Claims** — `claim_challenge` / `claim_achievement` lock the player, verify completion and
  "not yet claimed", then pay via `private.award` → ledger key `challenge:<id>:<period>` /
  `achievement:<id>`, so each reward pays once per period. Users cannot write `user_challenges` or
  `user_achievements` directly.
- **Squad metrics in SQL.** `teams.overall_cached` / `chemistry_cached` are refreshed by
  statement-level triggers on `team_players` (and on formation changes) using SQL ports of the
  TypeScript rules. `parity.integration.test.ts` saves 25 random line-ups through `save_lineup` and
  asserts SQL == TypeScript exactly.
- **Leaderboards** (`get_leaderboard`): level/XP, wins, goals (weekly or all-time), team rating, club
  value; ranks with ties, top N plus the caller's own row. Returns public game identity only.
- **Profiles** — `get_manager_profile(username)` returns a safe, game-only view (no e-mail) used by
  `/profile` (editable display name + 12 original avatars) and `/managers/[username]`.

## 2i. Testing, security review, deployment (Phase 9)

- **Security audit as tests.** `10_security_audit.test.sql` checks the whole schema: RLS on every
  table, `search_path` on every SECURITY DEFINER function, no anon table grants, no client writes to
  value-bearing tables, updatable columns limited to the 8 cosmetic ones, security_invoker views,
  private schema unreachable, `record_match` service-role only, no storage write policies. Verified to
  catch planted violations.
- **Account lifecycle.** Settings offers password change (re-verifies the current password on an
  isolated client), a full JSON data export (via the user's RLS-scoped client) and permanent account
  deletion (username + password confirmation; auth admin API; cascades tested; audit log scrubbed).
  Deletion runs as `supabase_auth_admin`, so trigger functions reached by the cascade are SECURITY
  DEFINER (structural guard in `11_account_deletion.test.sql`).
- **HTTP hardening.** CSP without nonces (nonce CSP is incompatible with Partial Prerendering),
  frame-ancestors none, nosniff, referrer/permissions policies, COOP, HSTS + upgrade-insecure-requests
  on HTTPS only, `X-Powered-By` removed. `shadcn` moved to devDependencies (CLI only), so production
  dependencies audit clean.
- **Test pyramid in CI.** Vitest → pgTAP → SQL↔TS parity → HTTP smoke (game + account) → Playwright
  (desktop journeys + phone overflow/tap) on a real local Supabase stack.

## 2j. Post-launch: password reset and manager challenges

- **Password reset.** `/forgot-password` calls `resetPasswordForEmail` (same reply whether or not the
  address exists); the e-mailed link signs the player in through `/auth/confirm` and lands on the
  signed-in-only `/reset-password`. Tested end to end through the local Mailpit inbox.
- **Challenges (friend matches).** A manager plays another manager's *saved active squad*; the opponent
  need not be online. `get_friendly_opponent(username)` (SECURITY DEFINER, authenticated) exposes only
  what a challenger may see: public profile, active formation/tactic/line-up with public card stats and
  the head-to-head record. The server builds both team sheets with the same `buildTeamSheet` and engine,
  and `record_match` (still service-role only) stores `opponent_user_id`/`opponent_team_id`.
  The database forces normal-difficulty rewards, shares the daily allowance and caps paid matches at
  `friendly_limits().rewarded_per_opponent` (5) per opponent per UTC day against coin farming.
  RLS lets the opponent read matches against their club; when they delete their account a
  SECURITY DEFINER trigger renames those matches to "Deleted club" and unlinks them.
  UI word: *challenge* (a "friendly" remains an unpaid match after the daily allowance).
- **Key moments (interactive matches).** Every kick-off creates the match row as `in_progress`
  (`start_match`, service role) with the seed and both team sheets, so the match is fixed from that
  point. The engine's `playMatch(input, decisions)` pauses at up to six moments — half-time team
  talk, a 75' call, up to three big chances (shoot / pass / dribble, spread over the match) and maybe a
  penalty (pick a corner). Outcomes use a second seeded stream, so a match is fully determined by
  seed + decisions, choices never change what happened before them, and classic matches (no
  `keyMoments`) replay exactly as before. `decideMoment` stores each decision with
  `record_match_decision` **before** computing its outcome (strict order, idempotent, no changes),
  then advances; at full time `finish_match` validates and pays as `record_match` always did
  (now built from the shared `private.open_match` + `private.settle_match`). An abandoned match
  pays nothing and still counts towards the daily limit; the Match Centre offers to continue it.
  Replay verification re-simulates with the stored decisions.
- **Matchday mode (current kick-off).** `input.matchday` adds touchline orders at any minute (tactic,
  10-minute shouts with a cooldown, up to 5 manual substitutions), per-player fatigue (tired players
  play up to 15% below their rating; pressing tires faster) and drops the 75' call. The server reveals
  the match a few minutes at a time (`advanceMatch` → `playMatch(…, { orders, untilMinute })`) and
  stores `revealed_minute` (only increases) before showing anything; `record_match_order` accepts an
  order only AT the revealed minute and it applies from the next minute, so nobody can look ahead and
  change the past. Chunked play is proven identical to a one-shot replay (unit-tested), and replay
  verification includes the orders. The screen shows a pre-match scouting report, a 2D pitch (formation
  dots shifting with possession), the touchline panel with stamina bars, and key-moment cards.

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
| 4 | ✅ `save_lineup`, `create_team`, `delete_team` (see §2d) |
| 5 | ✅ `buy_card`, `open_pack` (see §2e) |
| 6 | ✅ `upgrade_stadium` (see §2f) |
| 7 | ✅ `record_match` (service role only), `match_rewards`, `match_limits`, `level_for_xp` (see §2g) |
| 8 | ✅ `get_challenges`, `claim_challenge`, `get_achievements`, `claim_achievement`, `get_leaderboard`, `get_manager_profile` (see §2h) |

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
