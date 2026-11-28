# Football Legends

A football trading-card game: collect fictional player cards, build squads, upgrade your stadium,
earn Football Coins (FC) and compete in simulated matches.

Stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth,
Storage) · Vercel · uv (Python tooling).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, schema and security model.
CI (`.github/workflows/ci.yml`) runs every test suite below on each push and pull request.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, architecture, schema, auth | ✅ done |
| 2 | Dashboard and responsive game UI | ✅ done |
| 3 | Player cards, collection, player profiles | ✅ done |
| 4 | Team builder and formations | ✅ done |
| 5 | Coin economy, marketplace, packs | ✅ done |
| 6 | Stadium builder | ✅ done |
| 7 | Match simulation engine | ✅ done |
| 8 | Challenges, achievements, leaderboards | ✅ done |
| 9 | Testing, security review, deployment | ✅ done (deploy steps in docs/DEPLOYMENT.md) |
| — | Password reset, manager challenges (friend matches) | ✅ done |
| — | Interactive matches: key moments + matchday touchline (tactics, shouts, subs, fatigue) | ✅ done |
| — | Neighbourhood theme: home grounds, areas, derbies, area table | ✅ done |
| — | 3D match view (stadium, animated players, scenes, replays, sound) | ✅ done |
| — | "My Player" character, weekly league, daily streak, training, cup, squad missions, trading | planned |

## Prerequisites

- Node.js 20+ (developed on 24)
- Docker Desktop (runs the local Supabase stack)
- [uv](https://docs.astral.sh/uv/) (Python tooling only)

## Run locally

```bash
# 1. Start Supabase (Postgres, Auth, Storage, Studio) — applies all migrations
npx supabase start

# 2. Configure the web app
cd web
cp .env.example .env.local        # paste the keys printed by `npx supabase status`
npm install

# 3. Run
npm run dev                       # http://localhost:3000
```

Supabase Studio: http://127.0.0.1:54323 · Local e-mail inbox (Mailpit): http://127.0.0.1:54324

## Tests

```bash
npx supabase test db              # pgTAP: provisioning, ledger, RLS, views, privilege audit, squads, marketplace, stadium, matches, progression (repo root)
uv run pytest                     # Python: catalogue generator              (repo root)
cd web
npm test                          # Vitest unit tests
npm run typecheck && npm run lint
npm run check:boundaries         # server code must not import constants from "use client" modules
CALIBRATE=1 npx vitest run src/lib/engine/calibrate.test.ts --silent=false   # engine outcome report
INTEGRATION=1 npx vitest run src/lib/game/parity.integration.test.ts       # SQL ↔ TS team metrics (needs local stack)
npm run build && npm run start    # then, in another terminal:
npm run smoke                     # end-to-end over HTTP: every feature + tamper attempts
npm run smoke:account             # settings: password change, data export, account deletion
npm run test:e2e                  # Playwright browser tests (desktop + phone; uses installed Edge locally)
```

## Database workflow

- Schema changes = new file in `supabase/migrations/` (`npx supabase migration new <name>`).
- Apply from scratch: `npx supabase db reset`.
- Regenerate TypeScript types: `npx supabase gen types typescript --local --schema public > web/src/types/database.ts`
- Regenerate the fictional catalogue: `uv run football-app generate-catalog`

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Supabase Cloud + Vercel, step by step) and
**[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)** (what is done and what needs your decision
before a public launch).

## Content and licensing

All players, clubs, crests and biographies are fictional and original. No real player
photographs, names, club logos or other protected assets are used. Licensed real-world data can
be added later (`players.is_fictional = false` requires a `license_ref`).
