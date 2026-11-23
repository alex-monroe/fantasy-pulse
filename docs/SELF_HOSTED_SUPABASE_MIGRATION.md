# Moving fantasy-pulse to the self-hosted Supabase

**Status:** plan + rehearsed sync script. Nothing is switched yet.
**Deadline:** off hosted project `rbinbcwinchphipvcfqk` before **2026-12-07**.
After that date the owner cancels it ($25/mo).

## Why

fantasy-pulse shares one Postgres with sofa-db (`alex-monroe/ottoneu-db`).
On 2026-11-23 06:24–06:45 UTC sofa-db moved to a self-hosted Supabase stack on
a DigitalOcean droplet:

- **API:** `https://db.rosterloom.com`. Caddy passes only `/rest/v1/*` and
  `/auth/v1/*`.
- **Stack:** Supabase self-hosted `v0.8.4`: Postgres 17.6, PostgREST, GoTrue 2.197
  and Envoy. No Studio, Storage, Realtime, Edge Functions or public Postgres port.

The self-hosted DB already holds a **frozen copy** of fantasy-pulse's data from
06:24 UTC. Hosted keeps taking fantasy-pulse's writes until we switch.
Operating notes for the droplet live in `ottoneu-db/deploy/supabase/README.md`.

## Hard rules (shared database)

- **Touch only `public.fp_*`, the `fp_*` functions and the `auth` schema.**
  Every other `public` table is sofa-db's live production data.
- **Never run** `ottoneu-db/deploy/supabase/restore-from-hosted.sh`. It
  replaces the whole database.
- **Don't change** `JWT_SECRET`, the API keys, the compose files, the
  Caddyfile or the stack's services. Auth-only settings in
  `~/supabase/.env` are fine: redirect URLs and SMTP.
- **Never print secrets.** Pipe keys from the droplet into `gh secret set`.
  The owner pastes Vercel and EAS secret values themselves.

## What fantasy-pulse actually depends on

Audited on 2026-11-23. Corrections to the original brief are in **bold**.

| Consumer | Variables | Where they're set | Notes |
|---|---|---|---|
| Web (`apps/web`, Vercel) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Marketplace integration on Vercel, which can't be edited | Override them with project variables of the same name, or disconnect the integration (without deleting the store) and set them by hand. |
| Mobile preview (`mobile-preview.yml`, EAS Update) | `EXPO_PUBLIC_SUPABASE_*` ← GitHub secrets `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | GitHub repo secrets | Picks up the new values automatically once the secrets change. |
| Mobile release (`mobile-release.yml`, EAS Build) | `EXPO_PUBLIC_SUPABASE_*` | **EAS dashboard → "production" environment** (not GitHub) | Owner updates them there, then cuts a new TestFlight build. Old builds stop working once their refresh tokens fail. |
| Playwright CI (`playwright.yml`) | all three, from GitHub secrets | GitHub repo secrets | **It creates and deletes test users through the service-role key,** so CI writes to whichever DB the secrets point at. |
| `news-ingest.yml`, `sleeper-players-ingest.yml` | **only `CRON_SECRET`** | GitHub | **They call the deployed `/api/*/ingest` endpoints and never touch Supabase themselves**, so they follow Vercel's variables automatically. |

What's used: supabase-js and `@supabase/ssr` (PostgREST and GoTrue,
email/password only). Nothing uses direct Postgres, Storage, Realtime, Edge
Functions or OAuth sign-in. No code verifies JWTs locally, so the new
`JWT_SECRET` needs no code change.

**MCP OAuth survives the switch.** Its access and refresh tokens are
fantasy-pulse's own sha256-hashed rows in `fp_mcp_oauth_tokens`, checked
through `SECURITY DEFINER` RPCs. They aren't Supabase JWTs, so connected MCP
clients keep working once the rows are synced. Only Supabase sessions break.

## Data on hosted (2026-11-23 06:45 UTC)

- **Tables:** 12 `fp_*` tables:
  - `fp_user_integrations` 47
  - `fp_leagues` 29
  - `fp_teams` 11
  - `fp_news_items` 620, `fp_news_ingests` 1
  - `fp_mcp_oauth_clients` 3, `_codes` 2, `_tokens` 2
  - `fp_mcp_tokens`, `fp_notes`, `fp_sleeper_players` and `fp_sleeper_player_links` are empty
- **Functions:** 8 `fp_*` functions.
- **Auth:** 9 `auth.users` and 9 `auth.identities`, all with provider `email`.
- **Foreign keys:** no non-`fp_` table has a foreign key into `auth.users`.
  sofa-db has no auth users of its own.

## Auth settings: hosted vs self-hosted

Self-hosted values come from `~/supabase/.env` on the droplet:

| Setting | Self-hosted now | Needed |
|---|---|---|
| `SITE_URL` | `https://rosterloom.com` | The fantasy-pulse production origin. **Owner:** confirm whether it's `www.rosterloom.com` or `fantasy-pulse.vercel.app`. Signup confirmations (with autoconfirm off) and fallback redirects land here. |
| `ADDITIONAL_REDIRECT_URLS` | empty | Copy from hosted: Authentication → URL Configuration. At minimum: `http://localhost:9002/**`, the production origin `/**`, the Vercel preview pattern, and the mobile scheme `rosterloom://**` if anything uses it. |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` | Hosted value TBD. With `true`, sign-up needs no email, which is the only way sign-up works without SMTP. |
| SMTP | stock `supabase-mail:2500`, `fake_sender` | Decision below. |
| Password minimum | GoTrue default (6) | 6, the same as hosted and `/reset-password`. |
| Recovery template | stock (`?code=` PKCE link) | Hosted may use the `{{ .TokenHash }}` template from [AUTH.md](AUTH.md). On self-hosted that needs `GOTRUE_MAILER_TEMPLATES_RECOVERY` pointing at a hosted HTML file. It only matters once SMTP exists. |

Hosted's values still need reading from the dashboard. It needs the owner's
sign-in, and the Supabase MCP has no auth-config tool.

## Email recovery: decision needed

With no SMTP, `/forgot-password` sends nothing, and it says "check your email"
anyway. Options:

1. **Resend SMTP on rosterloom.com (recommended).** The free tier covers this
   easily.
   - The owner adds Resend's DNS records at Porkbun.
   - Set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`,
     `SMTP_PASS=<api key>`, `SMTP_ADMIN_EMAIL=no-reply@rosterloom.com` and
     `SMTP_SENDER_NAME=Roster Loom` in `~/supabase/.env`.
   - Then run `docker compose up -d --wait auth`.
   - This keeps the existing flow working with no code change.
2. **Hide forgot-password** and reset passwords by hand. Use
   `PUT /auth/v1/admin/users/<id>` with the secret key on the droplet. With
   9 users this is workable, but it's a manual chore.
3. **Ship without SMTP, then add it later.** Same as 2 until it's done.

Sign-up is fine either way while autoconfirm is on.

## The sync script

The script is [`supabase/selfhost/sync-fp-data.sh`](../supabase/selfhost/sync-fp-data.sh).
Copy it to `~/supabase-migration/` on the droplet and run it there:

```bash
scp supabase/selfhost/sync-fp-data.sh sofa:supabase-migration/
```

```bash
ssh sofa '~/supabase-migration/sync-fp-data.sh check'      # read-only guards
```

```bash
ssh sofa '~/supabase-migration/sync-fp-data.sh rehearse'   # full load, ROLLBACK
```

```bash
ssh sofa '~/supabase-migration/sync-fp-data.sh apply'      # backup, full load, COMMIT
```

- **What it copies:** every `public.fp_*` table plus `auth.users` and
  `auth.identities`. It reads them from hosted in one `REPEATABLE READ`
  snapshot and loads them in FK order.
- **What it clears:** every other table that references them (sessions,
  refresh tokens, MFA, OAuth and WebAuthn rows). All of these are useless
  under the new JWT secret.
- **Single transaction:** row counts are asserted against the same hosted
  snapshot before `COMMIT`, and owned sequences are moved past the loaded data.
- **Guards** (each one aborts):
  - the FK closure reaches any table outside `auth` / `public.fp_*` (it
    never uses `TRUNCATE … CASCADE`);
  - there's a user trigger on an auth table;
  - the `fp_*` table sets differ;
  - hosted has a column self-hosted lacks;
  - self-hosted has auth users that hosted doesn't, unless
    `ALLOW_DROP_LOCAL_USERS=1`.
- **Backup:** `apply` first saves a data-only `pg_dump` of the tables it's
  about to replace into the run's work directory (mode 700).
- **Secrets:** the intermediate dump holds password hashes and is deleted on
  exit. `HOSTED_DB_URL` reaches docker only by variable name.

**Rehearsed on 2026-11-23 06:47 UTC:** `check` passed. `rehearse` loaded all
14 tables, and every row count matched before the rollback.

**Schema drift:** if a fantasy-pulse migration lands after 2026-11-23, apply
it to self-hosted first. Run it through `docker exec -i supabase-db psql …` and
insert its version into `supabase_migrations.schema_migrations`. `check` refuses
to run while the `fp_*` schemas differ.

## Cutover runbook

Each step waits for the owner's go-ahead. Expect about 30 minutes of write
freeze.

0. **Prep.** None of this freezes writes:
   - Set `ADDITIONAL_REDIRECT_URLS` and `SITE_URL`, plus SMTP if chosen, then
     run `docker compose up -d --wait auth`.
   - Run `check` and `rehearse` again.
   - Have the owner sign in to Vercel and the EAS dashboard.
   - List each Vercel Supabase variable's **target environments and git
     branch**. In sofa-db's cutover, a Preview-only value also landed on
     Production and broke it.
1. **Freeze.**
   - Run `gh workflow disable news-ingest.yml`.
   - Run `gh workflow disable sleeper-players-ingest.yml`.
   - Don't merge PRs, because `playwright.yml` writes test users.
   - With 9 users, user-driven writes during the window are an accepted
     risk. Tell the owner's leagues if they want.
2. **Sync:** run `sync-fp-data.sh apply`, then check its log.
3. **Switch the web app.** Set Vercel Production (and Preview, if it should
   follow) to:
   - `NEXT_PUBLIC_SUPABASE_URL=https://db.rosterloom.com`;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the publishable key (`sb_publishable_…`);
   - `SUPABASE_SERVICE_ROLE_KEY` = the secret key (`sb_secret_…`).

   Get both keys from `sh run.sh secrets` on the droplet; the owner pastes
   them. Recheck each variable's targets, then redeploy production.
4. **GitHub secrets.** Pipe the values without printing them:
   - `NEXT_PUBLIC_SUPABASE_URL`: `gh secret set NEXT_PUBLIC_SUPABASE_URL --body https://db.rosterloom.com`.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: extract
     each key on the droplet and pipe it into
     `gh secret set <NAME> -R alex-monroe/fantasy-pulse` locally.
5. **Mobile:** the owner updates the EAS "production" environment's
   `EXPO_PUBLIC_*` values, then runs `mobile-release.yml`. Preview updates
   follow from step 4.
6. **Unfreeze:** re-enable both workflows and dispatch each one once.
7. **Smoke test:**
   - sign-up, sign-in and sign-out (web and mobile);
   - the chosen recovery path;
   - a Yahoo / ESPN / Sleeper / Ottoneu team refresh;
   - the MCP OAuth connect flow plus one tool call;
   - both ingest runs returning 200;
   - one Playwright CI run.
8. **Report** to the ottoneu-db side that hosted can be cancelled after the
   hold. Then update [environment.md](references/environment.md) and
   [AUTH.md](AUTH.md) to describe the self-hosted setup, and drop the hosted
   project ref.

**Rollback** (before hosted is cancelled): point the Vercel, GitHub and EAS
variables back at hosted and redeploy. Hosted still has all its data up to the
freeze, so the only loss is writes made on self-hosted after the switch.
