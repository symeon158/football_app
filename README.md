# Football Legends

A football trading-card game: collect fictional player cards, build squads, upgrade your stadium,
earn Football Coins (FC) and compete in simulated matches.

Stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth,
Storage) · Vercel · uv (Python tooling).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, schema and security model.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, architecture, schema, auth | ✅ done |
| 2 | Dashboard and responsive game UI | ✅ done |
| 3 | Player cards, collection, player profiles | ✅ done |
| 4 | Team builder and formations | ⏳ next |
| 5 | Coin economy, marketplace, packs | |
| 6 | Stadium builder | |
| 7 | Match simulation engine | |
| 8 | Challenges, achievements, leaderboards | |
| 9 | Testing, security review, deployment | |

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
npx supabase test db              # pgTAP: provisioning, ledger, RLS, views, privilege audit (repo root)
uv run pytest                     # Python: catalogue generator              (repo root)
cd web
npm test                          # Vitest unit tests
npm run typecheck && npm run lint
npm run build && npm run start    # then, in another terminal:
npm run smoke                     # end-to-end: sign-up → dashboard → every route → tamper attempts
```

## Database workflow

- Schema changes = new file in `supabase/migrations/` (`npx supabase migration new <name>`).
- Apply from scratch: `npx supabase db reset`.
- Regenerate TypeScript types: `npx supabase gen types typescript --local --schema public > web/src/types/database.ts`
- Regenerate the fictional catalogue: `uv run football-app generate-catalog`

## Deploying (Phase 9 covers this in full)

1. Create a Supabase project, then `npx supabase link --project-ref <ref>` and `npx supabase db push`.
2. In Supabase Auth settings set the Site URL to your Vercel URL, add `<url>/auth/confirm` to the
   redirect allow-list, and enable e-mail confirmation.
3. Import the GitHub repo in Vercel with **Root Directory = `web`** and set
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `SUPABASE_SECRET_KEY` (server-only).

## Content and licensing

All players, clubs, crests and biographies are fictional and original. No real player
photographs, names, club logos or other protected assets are used. Licensed real-world data can
be added later (`players.is_fictional = false` requires a `license_ref`).
