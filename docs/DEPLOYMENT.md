# Deploying Football Legends

Target: **Supabase Cloud** (database, auth, storage) + **Vercel** (Next.js app). Everything below is
done once; afterwards every push to `main` deploys via Vercel and is checked by CI
(`.github/workflows/ci.yml`).

> Order matters: create the database first, then the app (the app needs the database URL and keys).

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard> (pick the region closest to your players;
   keep the generated database password in a password manager).
2. From the repo root, link and push the schema:

   ```bash
   npx supabase login                       # opens the browser once
   npx supabase link --project-ref <ref>    # <ref> is in the project URL
   npx supabase db push                     # applies every migration, incl. the player catalogue
   ```

   `db push` only runs migrations; it never runs the local test files or seed data.
3. **API keys** — *Project Settings → API Keys*: copy the **publishable** key and the **secret** key.
   The secret key bypasses Row Level Security: it goes **only** into server-side environment variables.
4. **Auth → URL configuration**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/confirm` (add Vercel preview URLs if you use them,
     e.g. `https://*-<team>.vercel.app/auth/confirm`)
5. **Auth → Providers → Email**
   - **Confirm email: ON** (it is off only in local development).
   - Minimum password length **8**, require **letters and digits** (matches the app's validation).
   - Enable *leaked password protection* if your plan offers it.
6. **Auth → Email templates → Confirm signup** — point the link at the app's confirm route:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm your e-mail</a>
   ```

7. **Auth → SMTP** — configure a real e-mail provider (Resend, Postmark, SES…). Supabase's built-in
   sender is limited to a few e-mails per hour and is not meant for production sign-ups.
8. **Auth → Rate limits** — keep the defaults (the local `config.toml` raises sign-in limits only for
   automated tests).
9. **Database → Backups** — on a paid plan, enable Point-in-Time Recovery before launch.

## 2. Vercel project

1. Push this repository to GitHub (private or public).
2. In Vercel: **Add New → Project → Import** the repo.
   - **Root Directory: `web`** (the Next.js app lives there; `supabase/` and the Python tools stay out
     of the deployment).
   - Framework preset: Next.js. Node.js version: 24.x.
3. **Environment variables** (Production, and Preview if you use previews):

   | Name | Value | Exposure |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | public |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | public |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` (must be `https://`) | public |
   | `SUPABASE_SECRET_KEY` | secret key | **server only — never prefix with `NEXT_PUBLIC_`** |

   `NEXT_PUBLIC_SITE_URL` starting with `https://` also switches on HSTS and
   `upgrade-insecure-requests` (see `next.config.ts`).
4. Deploy, then add your domain under **Settings → Domains** and set the same domain in Supabase's
   Site URL (step 1.4).

## 3. Verify the production deployment

- [ ] Open the site: landing page loads; response headers include `Content-Security-Policy`,
      `Strict-Transport-Security`, `X-Frame-Options: DENY`.
- [ ] Sign up with a real address → confirmation e-mail arrives → link lands on `/dashboard`.
- [ ] New club has 1,000 FC, 17 cards, a stadium and a full XI.
- [ ] Play a match → reward arrives, match page shows **Verified replay**.
- [ ] Buy a cheap player, open a Bronze pack, upgrade lighting → Coin history shows all of them.
- [ ] Claim a challenge; leaderboards and profile load.
- [ ] Settings → **Download my data** works; delete a *test* account and confirm it can't sign in.
- [ ] Browser devtools: no secret key in any JavaScript file (search sources for `sb_secret_`).
- [ ] Supabase → *Advisors* (security & performance): no errors.

## 4. Operating it

- **Schema changes**: add a migration (`npx supabase migration new <name>`), run `supabase test db`
  locally, merge (CI runs everything), then `npx supabase db push`. Push migrations *before* deploying
  app code that depends on them.
- **Engine changes**: bump `ENGINE_VERSION` in `web/src/lib/engine/types.ts`; older matches then show
  "Played on engine x" instead of a replay check.
- **Secrets**: rotate the secret key in Supabase and update `SUPABASE_SECRET_KEY` in Vercel together.
- **Logs**: Vercel → Logs (server actions, errors); Supabase → Logs (Postgres, Auth, API).
