# Environment Variables

Copy `.env.example` to `.env.local` and fill in. The dev server,
Playwright, and `setup.sh` all read from `.env.local`.

## Supabase

Roster Loom shares one Postgres with sofa-db (`alex-monroe/ottoneu-db`).
Since **2026-11-23** that is a **self-hosted Supabase stack** on a
DigitalOcean droplet, served at `https://db.rosterloom.com`. Its operating
notes are in `ottoneu-db/deploy/supabase/README.md`, and the move is
written up in [../SELF_HOSTED_SUPABASE_MIGRATION.md](../SELF_HOSTED_SUPABASE_MIGRATION.md).

- **Only `/rest/v1` and `/auth/v1` are exposed.** There's no Studio,
  Storage, Realtime or public Postgres port.
- **Table names:** Roster Loom's tables all carry an `fp_` prefix. Every
  other `public` table is sofa-db's.
- **Hosted project gone:** the old hosted project
  (`rbinbcwinchphipvcfqk`) is no longer used and is due to be cancelled
  after 2026-12-07. The Supabase MCP server still points at it, so don't
  treat it as production.

**Getting the keys:** run `ssh sofa 'cd ~/supabase && sh run.sh secrets'`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` takes the `sb_publishable_…` key.
- `SUPABASE_SERVICE_ROLE_KEY` takes the `sb_secret_…` key.

The legacy JWT keys work too. Pipe secret values straight into
`gh secret set` / `vercel env add` rather than printing them.

**Where they're set:**
- **Vercel:** project variables, separate for Production and Preview.
  The `NEXT_PUBLIC_*` ones are Config type, because Vercel refuses
  `NEXT_PUBLIC_` Secrets.
- **GitHub repo secrets:** used by Playwright and mobile preview.
- **EAS "production" environment:** `EXPO_PUBLIC_*`, for TestFlight
  builds.

| Variable                         | Where used                              | Notes |
| -------------------------------- | --------------------------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Browser + server Supabase clients       | Public — fine to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Browser + server Supabase clients       | Public — RLS-protected. |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-only privileged operations       | **Never expose to the browser.** Bypasses RLS. |
| `NEXT_PUBLIC_PASSWORD_RESET_EMAIL` | Shows the emailed password-reset flow | Optional. Only `on` enables it; anything else hides it and points users at the admin. Leave it unset while the self-hosted Supabase has no SMTP ([../SELF_HOSTED_SUPABASE_MIGRATION.md](../SELF_HOSTED_SUPABASE_MIGRATION.md)). |

Auth redirect URLs are GoTrue configuration, not app env vars. They're
`ADDITIONAL_REDIRECT_URLS` in `~/supabase/.env` on the droplet.
See [../AUTH.md](../AUTH.md).

## Yahoo OAuth

| Variable             | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `YAHOO_CLIENT_ID`    | OAuth client ID from the Yahoo developer console     |
| `YAHOO_CLIENT_SECRET`| OAuth client secret — server-only                    |
| `YAHOO_REDIRECT_URI` | OAuth callback URL (must match Yahoo app settings)   |

The redirect URI in local dev is typically
`http://localhost:9002/api/auth/yahoo` (note the **9002** dev port).

## CI

The GitHub Actions Playwright workflow pulls the three Supabase values
from repo secrets with matching names. Yahoo credentials are not
required for CI today — Yahoo flows are mocked at
`e2e/mocks/external-apis.js`.

## Sleeper / Ottoneu

Neither provider requires API credentials. Sleeper is username-based,
Ottoneu data is scraped from public pages.

## News digest

| Variable            | Where used | Notes |
| ------------------- | ---------- | ----- |
| `CRON_SECRET`       | Web server + GitHub Actions | Bearer token `/api/news/ingest` and `/api/sleeper-players/ingest` require. Set the same value on the deployment and as a repository Actions secret (the `News Ingest` and `Sleeper Players Ingest` workflows send it). **Unset means the endpoint is disabled (503), not open.** |
| `ROTOWIRE_RSS_URL`  | Web server | Overrides the news feed URL. Defaults to Rotowire's public NFL news RSS. |

Ingesting also needs `SUPABASE_SERVICE_ROLE_KEY` (above): `fp_news_items`
grants no write access to the anon role on purpose. See
[../NEWS_DIGEST.md](../NEWS_DIGEST.md).

## Demo mode

| Variable                 | Where used | Notes |
| ------------------------ | ---------- | ----- |
| `DEMO_MODE`              | Web server | `1` serves deterministic fake data instance-wide (no providers needed). Blank/`0` = normal. Per-session override: `?demo=1` / `?demo=0`. |
| `EXPO_PUBLIC_DEMO_MODE`  | Mobile app | `1` makes the mobile app request demo data (sends `x-demo-mode`) and poll every 30s. |

See [DEMO_MODE.md](../DEMO_MODE.md) for the full walkthrough.
