# Architecture

High-level design of Roster Loom (a.k.a. fantasy-pulse).

## Tech stack

| Layer            | Choice                                                         |
| ---------------- | -------------------------------------------------------------- |
| Framework        | Next.js **15.3.6** (App Router, Turbopack dev)                 |
| Language         | TypeScript 5                                                   |
| Runtime          | Node **20.x** (`engines` + `.nvmrc`)                           |
| UI               | React 18, Tailwind CSS 3, shadcn/Radix UI                      |
| Auth + DB        | Supabase (Postgres + Auth, SSR via `@supabase/ssr`)            |
| Unit tests       | Jest 29 + Testing Library (jsdom env)                          |
| E2E tests        | Playwright 1.55 (CI-only; see [TESTING.md](TESTING.md))        |
| Lint             | ESLint via `next lint` (`next/core-web-vitals`)                |
| Hosting          | Vercel (per-PR previews)                                       |
| Observability    | Vercel Speed Insights, `pino` logs, `performance-logger` utility |

## Top-level layout

```
apps/web/                     # Next.js app (Vercel deploys this)
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (dashboard)/      # Authenticated dashboard route group
│   │   ├── api/              # Route handlers (OAuth callbacks, teams API)
│   │   ├── integrations/     # One folder per provider (sleeper, yahoo, ottoneu)
│   │   ├── login/  register/
│   │   ├── actions.ts        # Cross-provider server actions (team building, scoring)
│   │   ├── layout.tsx  page.tsx  loading.tsx
│   │   └── globals.css
│   ├── components/           # App-specific + shadcn UI primitives (`components/ui`)
│   ├── hooks/                # React hooks (`use-mobile`, `use-toast`)
│   ├── lib/                  # Web-only: env, `cn`, doc-map test
│   ├── utils/                # logger, performance-logger, supabase clients
│   ├── ai/                   # Generative AI helpers (currently `dev.ts`)
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
              → sleeper/actions.ts | yahoo/actions.ts | ottoneu/actions.ts
                → external API (cached/throttled per provider)
              → mapSleeperPlayer / Yahoo parser / Ottoneu scraper (JSDOM)
            → merge into Team[] with cross-team Player share counts
        → render PlayerCard grid with live scores + game progress
```

Every provider follows the same shape: an `actions.ts` (server), a `page.tsx`
(integration management UI), a per-provider `README.md`, and an
`*.example.json` snapshot for the most useful API response.

## Provider integration pattern

Each integration under `apps/web/src/app/integrations/<provider>/`:

- `actions.ts` — `'use server'` API calls + DB writes; export
  `build<Provider>Teams` consumed by `apps/web/src/app/actions.ts`
- `actions.test.ts` — unit tests colocated next to implementation
- `page.tsx` — UI for connecting and managing the integration
- `README.md` — flow + payload shapes
- `*.example.json` — captured API responses for reference and tests

To add a new provider, follow [adding-integrations.md](adding-integrations.md).

## Database

Supabase Postgres. Schema is owned by SQL migrations in
`supabase/migrations/` and reproduced for reference in
[references/database-schema.md](references/database-schema.md).

Core tables (all prefixed `fp_` to distinguish them from the sibling
repo's tables on the shared OttoneuDB project):

- `fp_user_integrations` — per-user provider connections (Sleeper ID,
  Yahoo OAuth tokens, etc.)
- `fp_leagues` — league rows imported from each provider
- `fp_teams` — teams pulled from each league
- `fp_notes` — free-form user notes

Server-side Supabase access goes through `apps/web/src/utils/supabase/server.ts`;
client-side through `apps/web/src/utils/supabase/client.ts`. `middleware.ts`
keeps sessions fresh on every request.

## Performance discipline

The home page assembles data from 1–3 external fantasy APIs on every
load. Recent commits (see `git log`) have focused on:

- `Promise.all` fan-out in `apps/web/src/app/actions.ts`
- Reusing Yahoo access tokens across a single request
- Caching Sleeper player data (TTL in `actions.ts`)
- `performance-logger.ts` wrapping every external call so we can spot
  regressions in CI/observability

When adding work to the home-page path, prefer batching and reuse over
sequential awaits, and wrap external calls with `startTimer` / `logDuration`.
