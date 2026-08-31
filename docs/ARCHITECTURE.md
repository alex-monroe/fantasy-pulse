# Architecture

High-level design of Roster Loom (a.k.a. fantasy-pulse).

Four providers are supported: **Sleeper**, **Yahoo**, **Ottoneu** and
**ESPN**. They are not interchangeable — Sleeper is username-based,
Yahoo is OAuth, Ottoneu is scraped from public pages, and ESPN reuses
two cookies copied from a logged-in browser session.

## Tech stack

| Layer            | Choice                                                         |
| ---------------- | -------------------------------------------------------------- |
| Framework        | Next.js **15.3.6** (App Router, Turbopack dev)                 |
| Language         | TypeScript 5                                                   |
| Runtime          | Node **20.x** (`engines` + `.nvmrc`)                           |
| UI               | React 19, Tailwind CSS 3, shadcn/Radix UI                      |
| Auth + DB        | Supabase (Postgres + Auth, SSR via `@supabase/ssr`)            |
| Unit tests       | Jest 29 + Testing Library (jsdom env)                          |
| E2E tests        | Playwright 1.55 (CI-only; see [TESTING.md](TESTING.md))        |
| Lint             | ESLint via `next lint` (`next/core-web-vitals`)                |
| Hosting          | Vercel (per-PR previews)                                       |
| PWA              | `next-pwa` wraps the config; service worker at `public/sw.js` (disabled in dev) |
| Observability    | Vercel Speed Insights, `pino` logs, `performance-logger` utility |

## Top-level layout

```
apps/web/                     # Next.js app (Vercel deploys this)
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (dashboard)/      # Authenticated dashboard route group
│   │   ├── api/              # Route handlers (OAuth callbacks, teams API)
│   │   ├── integrations/     # One per provider (sleeper, yahoo, ottoneu, espn)
│   │   ├── login/  register/
│   │   ├── actions.ts        # Cross-provider server actions (team building, scoring)
│   │   ├── layout.tsx  page.tsx  loading.tsx
│   │   └── globals.css
│   ├── components/           # App-specific + shadcn UI primitives (`components/ui`)
│   ├── hooks/                # React hooks (`use-mobile`, `use-toast`)
│   ├── lib/                  # Web-only: env, `cn`, doc-map test
│   ├── utils/                # logger, performance-logger, supabase clients
│   └── middleware.ts         # Supabase session refresh middleware
└── e2e/                      # Playwright specs (do not run locally — see TESTING.md)

packages/core/                # @roster-loom/core — shared with the mobile app
└── src/
    ├── types.ts              # Shared TS types (Team, Player, Sleeper*)
    ├── sleeper.ts            # `mapSleeperPlayer` and related helpers
    ├── fetch-json.ts         # Typed JSON fetch with caching/retry
    └── mock-data.ts          # Fixtures for tests and dev

supabase/migrations/          # SQL migrations (source of truth for schema)
```

See [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) for module boundaries and conventions.

## Data flow: live scoreboard

```
User → / (home)
      → apps/web/src/app/page.tsx (server component)
        → apps/web/src/app/actions.ts:buildAllTeams()
          → for each user_integration:
              → sleeper | yahoo | ottoneu | espn actions.ts
                → external API (cached/throttled per provider)
              → mapSleeperPlayer / Yahoo parser / Ottoneu scraper (JSDOM) / ESPN parser
            → merge into Team[] with cross-team Player share counts
        → render PlayerCard grid with live scores + game progress
```

Every provider follows the same shape: an `actions.ts` (server), a
`page.tsx` (integration management UI), a colocated `actions.test.ts`, a
per-provider `README.md`, and an `*.example.json` snapshot for the most
useful API response where one applies.

`getTeams()` is the single seam every consumer sits behind: the web
render, the mobile app (via `/api/teams/refresh`), demo mode, and the
[MCP server](MCP.md) (via `/api/mcp`) all read the same `Team[]`.

## Provider integration pattern

Each integration under `apps/web/src/app/integrations/<provider>/`:

- `actions.ts` — `'use server'` API calls + DB writes. Note that the
  `build<Provider>Teams` functions, which turn a provider's raw payloads
  into `Team[]`, currently live in `apps/web/src/app/actions.ts` rather
  than here.
- `actions.test.ts` — unit tests colocated next to implementation
- `page.tsx` — UI for connecting and managing the integration
- `README.md` — flow + payload shapes
- `*.example.json` — captured API responses for reference and tests

To add a new provider, follow [adding-integrations.md](adding-integrations.md).

## Database

Supabase Postgres. Schema is owned by SQL migrations in
`supabase/migrations/` and reproduced for reference in
[references/database-schema.md](references/database-schema.md).

Eight tables, all prefixed `fp_` to distinguish them from the sibling
repo's tables on the shared OttoneuDB project:

- `fp_user_integrations` — per-user provider connections (Sleeper ID,
  Yahoo OAuth tokens, ESPN cookies)
- `fp_leagues` — league rows imported from each provider
- `fp_teams` — teams pulled from each league
- `fp_notes` — free-form user notes
- `fp_mcp_tokens` — hashed personal access tokens for the
  [MCP server](MCP.md)
- `fp_mcp_oauth_clients`, `fp_mcp_oauth_codes`, `fp_mcp_oauth_tokens` —
  the OAuth 2 + PKCE flow for MCP connector UIs

The four MCP tables enable row level security and reach their
unauthenticated paths through eight `SECURITY DEFINER` functions. The
four app tables have no policies in any migration — see the
[schema reference](references/database-schema.md#row-level-security),
which flags that as unresolved.

Server-side Supabase access goes through `apps/web/src/utils/supabase/server.ts`;
client-side through `apps/web/src/utils/supabase/client.ts`. `middleware.ts`
keeps sessions fresh on every request.

## Performance discipline

The home page assembles data from 1–4 external fantasy APIs on every
load. Recent commits (see `git log`) have focused on:

- `Promise.all` fan-out in `apps/web/src/app/actions.ts`
- Reusing Yahoo access tokens across a single request
- Caching Sleeper player data (TTL in `actions.ts`)
- `performance-logger.ts` wrapping every external call so we can spot
  regressions in CI/observability

When adding work to the home-page path, prefer batching and reuse over
sequential awaits, and wrap external calls with `startTimer` / `logDuration`.
