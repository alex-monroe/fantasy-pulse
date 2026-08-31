# Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in. The
dev server and Playwright both read from it.

None of this is needed to *run* the app: `DEMO_MODE=1 npm run dev`
serves fake data with no database and no credentials. See
[DEMO_MODE.md](../DEMO_MODE.md).

## Supabase

Roster Loom shares the **`OttoneuDB`** Supabase project (ref
`rbinbcwinchphipvcfqk`). It was migrated from a standalone
`fantasy-pulse` project in May 2026 to consolidate fantasy-football
infrastructure under one project; Roster Loom's tables all carry an
`fp_` prefix (`fp_user_integrations`, `fp_leagues`, `fp_teams`,
`fp_notes`) so they're visually distinct from OttoneuDB's unrelated
tables in the `public` schema.

Prefer the **local stack** for development — `npm run db:start` boots
Postgres with every migration applied and prints the URL and anon key to
paste into `.env.local`. It keeps your experiments off the project
shared with the sibling repo.

For the hosted project, pull credentials from the
[OttoneuDB API settings](https://supabase.com/dashboard/project/rbinbcwinchphipvcfqk/settings/api-keys).

| Variable                         | Where used                              | Notes |
| -------------------------------- | --------------------------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Browser + server Supabase clients       | Public — fine to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Browser + server Supabase clients       | Ships in the browser bundle. RLS protects the four MCP tables; the four app tables have no policies in any migration — see [database-schema.md](database-schema.md#row-level-security). |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-only privileged operations       | **Never expose to the browser.** Bypasses RLS. |

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

## Sleeper / Ottoneu / ESPN

None of these require environment variables. Sleeper is username-based,
Ottoneu is scraped from public pages, and ESPN authenticates with two
cookies (`espn_s2`, `SWID`) that the user pastes into the integration UI
and which are stored per-user in `fp_user_integrations` — not in the
environment. See
[the ESPN README](../../apps/web/src/app/integrations/espn/README.md).

## Demo mode

| Variable                 | Where used | Notes |
| ------------------------ | ---------- | ----- |
| `DEMO_MODE`              | Web server | `1` serves deterministic fake data instance-wide (no providers needed). Blank/`0` = normal. Per-session override: `?demo=1` / `?demo=0`. |
| `EXPO_PUBLIC_DEMO_MODE`  | Mobile app | `1` makes the mobile app request demo data (sends `x-demo-mode`) and poll every 30s. |

See [DEMO_MODE.md](../DEMO_MODE.md) for the full walkthrough.
