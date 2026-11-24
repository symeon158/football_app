# Public launch checklist

Status legend: ✅ done in the codebase · ⬜ needs an owner decision or account access.

## Security
- ✅ Row Level Security on every table; schema-wide audit test (`supabase/tests/database/10_security_audit.test.sql`)
  fails CI if a table lacks RLS, a SECURITY DEFINER function lacks `search_path`, or API roles gain writes.
- ✅ Coins, cards, stadium levels, match results and rewards only change through validated,
  idempotent database functions; the ledger is append-only and always equals the balance (tested).
- ✅ Match results can only be recorded by the server (service role); players cannot submit scores.
- ✅ Secret key is server-only (`server-only` imports); verified absent from client bundles.
- ✅ Security headers: CSP (no-nonce variant, required by Partial Prerendering), frame-ancestors none,
  nosniff, referrer and permissions policies, HSTS on HTTPS.
- ✅ Open-redirect protection on sign-in `next`; inputs validated with zod; DB errors mapped to safe messages.
- ✅ Production dependencies: `npm audit --omit=dev` clean (checked in CI).
- ⬜ Turn on e-mail confirmation, custom SMTP and leaked-password protection in Supabase (see DEPLOYMENT.md).
- ⬜ Review Supabase *Advisors* after the first deploy.

## Privacy & legal
- ✅ E-mail addresses are never shown to other players; leaderboards and public profiles expose game data only.
- ✅ Players can download all their data and permanently delete their account (Settings); deletion
  scrubs usernames from the audit log.
- ⬜ **Privacy policy and terms of service** — required before collecting e-mail addresses publicly
  (GDPR and similar). These need to be written or approved by you; link them from the footer and sign-up form.
- ⬜ Decide on minimum age and whether you need parental consent in your target countries.
- ⬜ If you add analytics or non-essential cookies later: a consent banner.

## Fair play & content
- ✅ Coins are earned only by playing; no real-money purchases; pack odds published and statistically tested.
- ✅ All players, clubs, crests and artwork are fictional/original. Licensed real players can be added
  later (`players.is_fictional = false` requires a `license_ref`).
- ⬜ If packs are offered in jurisdictions with loot-box rules, confirm compliance (they cannot be bought
  with money here, which is the usual legal trigger).

## Reliability & scale
- ✅ Every server-side Supabase request times out after 10 s; game pages have an error boundary with retry.
- ✅ Prefetches are static (no per-link server renders); squad metrics are cached by triggers.
- ⬜ Enable Point-in-Time Recovery backups (paid plan).
- ⬜ Leaderboards compute live per request — fine for thousands of players; beyond ~50k, move them to a
  materialized view refreshed on a schedule.
- ⬜ Optional: error monitoring (e.g. Sentry) and uptime checks.

## Quality gates (all automated in CI)
- ✅ pgTAP (database rules, RLS, economy, engine trust boundary, progression, deletion, security audit)
- ✅ Vitest (game rules, engine determinism & statistics, validation)
- ✅ SQL ↔ TypeScript parity test
- ✅ HTTP smoke tests (game + account) and Playwright browser tests (desktop + phone)
- ✅ Lint, typecheck, server/client boundary check, production build
