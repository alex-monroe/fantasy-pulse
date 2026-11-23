# Moving fantasy-pulse to the self-hosted Supabase

**Status: cut over 2026-11-23 06:55–07:10 UTC.** Production runs on
`db.rosterloom.com`. Hosted project `rbinbcwinchphipvcfqk` gets no
fantasy-pulse traffic. It stays as the rollback (for both repos) until
about **2026-12-07**, when the owner cancels it ($25/mo).

### Cutover log (2026-11-23)

- **06:52:** `ADDITIONAL_REDIRECT_URLS` was copied from hosted.
- **06:55:** `sync-fp-data.sh apply` committed. All 14 tables match hosted
  (9 users, 47 integrations, 29 leagues, 11 teams, 620 news items, the MCP
  OAuth rows). The backup is in
  `~/supabase-migration/fp-sync-20261123T065545Z-apply-5hNQ/`.
- **Vercel:** Production and Preview `NEXT_PUBLIC_SUPABASE_URL` /
  `_ANON_KEY` were switched; they're now Config type. The owner set
  `SUPABASE_SERVICE_ROLE_KEY`. PR #253's merge redeployed prod.
- **GitHub secrets** were switched from the droplet. The owner set the
  EAS production values.
- **Verified on prod:**
  - the browser bundle uses only `db.rosterloom.com`;
  - sign-in works (the owner signed in), and the dashboard loads leagues;
  - team refresh wrote new `fp_teams` rows, and the bumped sequences
    held;
  - full MCP OAuth (DCR register → consent → PKCE token → `list_leagues`)
    works; the test client was deleted;
  - `/login` shows the admin-reset message;
  - Playwright passed 8/8 against self-hosted (PR #254 run).
- **Not verified, blocked by problems that predate the move:**
  - **Ingest workflows:** `CRON_SECRET` is set on neither Vercel nor
    GitHub. The endpoints answer 503, and the workflows have failed since
    at least Nov 21. The owner chose to leave this for now.
  - **TestFlight build:** `mobile-release.yml` fails at checkout because
    `RELEASE_PUSH_TOKEN` (a PAT) no longer works. Mobile sign-in on a new
    build is untested until it's regenerated. Old installs still point at
    hosted.

**Rolling back** (until hosted is cancelled) is in the last section.
Writes made on self-hosted since 06:55 would be lost.

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

Self-hosted values live in `~/supabase/.env` on the droplet. GoTrue is shared
with sofa-db, but sofa-db has no auth users.

| Setting | Hosted | Self-hosted | Status |
|---|---|---|---|
| Redirect URLs | `https://www.rosterloom.com/**`, `http://localhost:9002/**` | same, as `ADDITIONAL_REDIRECT_URLS` | **Done 2026-11-23 06:52 UTC.** `.env` backed up to `.env.bak-20261123T065205Z`; auth restarted healthy. |
| `SITE_URL` | rosterloom (per owner) | `https://rosterloom.com` | Left as is: the apex 307s to `https://www.rosterloom.com/` and keeps the path. |
| `ENABLE_EMAIL_AUTOCONFIRM` | — | `true` | Keep. Without SMTP, it's the only way sign-up works. |
| SMTP | working | none (stock `supabase-mail`) | **Decided:** no SMTP for now; see below. |
| Password minimum | 6 | GoTrue default (6) | Matches `/reset-password`. |

## Email recovery: decided — hidden, admin resets by hand

The owner chose this on 2026-11-23.

- **The app hides the emailed reset flow** unless
  `NEXT_PUBLIC_PASSWORD_RESET_EMAIL=on`
  ([`apps/web/src/lib/password-reset.ts`](../apps/web/src/lib/password-reset.ts)).
  - `/login` shows "ask the admin" in place of "Forgot your password?".
  - `/forgot-password` and an expired `/reset-password` say the same instead
    of offering a form that silently sends nothing.
  - The code path stays in place. To bring it back, add SMTP to GoTrue and
    set the flag on Vercel.
- **The admin resets passwords** with
  [`supabase/selfhost/reset-password.sh`](../supabase/selfhost/reset-password.sh)
  on the droplet. It goes through GoTrue's admin API, and the service key
  never appears in argv or output.

  ```bash
  ssh sofa '~/supabase-migration/reset-password.sh user@example.com'
  ```

  It prints a one-time temporary password; send it to the user out of band.
  It was tested on 2026-11-23 against `test@test.com` (reset to its documented
  password, signed in successfully).
- **Bringing email back later:** for example, Resend on rosterloom.com.
  - Add Resend's DNS records at Porkbun.
  - Set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`,
    `SMTP_PASS=<api key>`, `SMTP_ADMIN_EMAIL=no-reply@rosterloom.com` and
    `SMTP_SENDER_NAME=Roster Loom` in `~/supabase/.env`.
  - Run `docker compose up -d --wait auth`.
  - Set `NEXT_PUBLIC_PASSWORD_RESET_EMAIL=on` and redeploy.

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
   - Redirect URLs are already done.
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
   - `/login` shows "ask the admin", and `reset-password.sh` works on a real
     account;
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
