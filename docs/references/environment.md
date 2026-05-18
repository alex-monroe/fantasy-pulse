# Environment Variables

Copy `.env.example` to `.env.local` and fill in. The dev server,
Playwright, and `setup.sh` all read from `.env.local`.

## Supabase

| Variable                         | Where used                              | Notes |
| -------------------------------- | --------------------------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Browser + server Supabase clients       | Public — fine to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Browser + server Supabase clients       | Public — RLS-protected. |
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

## Sleeper / Ottoneu

Neither provider requires API credentials. Sleeper is username-based,
Ottoneu data is scraped from public pages.
