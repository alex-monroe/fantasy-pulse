# Code Organization

Where things live and why. Pair this with [ARCHITECTURE.md](ARCHITECTURE.md).

## Monorepo layout

```
fantasy-pulse/
├── apps/
│   ├── web/             # Next.js app (this is what Vercel deploys)
│   │   ├── src/
│   │   ├── e2e/
│   │   ├── public/
│   │   └── (configs: next, tsconfig, jest, tailwind, playwright, eslint)
│   └── mobile/          # Expo / React Native app
│       ├── app/         # Expo Router screens
│       ├── lib/         # supabase client, session provider
│       ├── components/, hooks/, constants/   # UI primitives (scaffolded)
│       ├── __tests__/   # Jest tests (jest-expo)
│       └── (configs: app.json, tsconfig, jest)
├── packages/
│   └── core/            # @roster-loom/core — shared logic + types
│       └── src/
├── supabase/            # Migrations (shared OttoneuDB; not app-specific)
├── docs/                # This directory
└── package.json         # Workspace root
```

Mobile-specific guide: [MOBILE.md](MOBILE.md).

### What goes in `packages/core/` {#what-goes-in-packagescore}

Pure TypeScript only. No React, no Next.js, no browser-only globals
(`window`, `document`), no node-only globals (`fs`, `process.cwd`). The
mobile app shares this code, so anything that doesn't run in both
environments belongs in an app, not the package.

Currently shared: shared types (`types.ts`), Sleeper helpers
(`sleeper.ts`), `fetchJson`, and mock data fixtures. Import as
`@roster-loom/core`.

## `apps/web/src/app/` — Next.js App Router

| Path                          | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `page.tsx`                    | Public landing / home scoreboard                       |
| `layout.tsx`                  | Root layout (fonts, providers, global chrome)          |
| `loading.tsx`                 | Suspense fallback for `page.tsx`                       |
| `globals.css`                 | Tailwind base layer + CSS variables                    |
| `actions.ts`                  | Cross-provider server actions (team building, scoring) |
| `actions.test.ts`             | Jest tests for `actions.ts`                            |
| `(dashboard)/`                | Authenticated route group (matchup report, etc.)      |
| `api/auth/<provider>/route.ts`| OAuth callbacks                                        |
| `api/teams/`                  | Team-related route handlers                            |
| `integrations/<provider>/`    | One folder per fantasy provider (see below)            |
| `login/`, `register/`         | Auth pages                                             |

## `apps/web/src/app/integrations/<provider>/` — provider modules

Every provider directory follows the **same five-file pattern**:

```
integrations/<provider>/
├── actions.ts           # 'use server' API calls + DB writes
├── actions.test.ts      # Jest tests, colocated
├── page.tsx             # Connect / manage UI
├── README.md            # Flow + payload shapes
└── *.example.json       # Captured API response (when applicable)
```

Adding a new provider? Follow [adding-integrations.md](adding-integrations.md);
it codifies this exact pattern.

## `apps/web/src/components/`

- Top-level: app-specific components (`home-page.tsx`,
  `player-card.tsx`, `app-navigation.tsx`, `matchup-priority-selector.tsx`)
- `components/ui/`: shadcn/Radix primitives — treat as generated/library
  code; only edit if you'd accept the change upstream.

Component tests are colocated as `<name>.test.tsx` next to the implementation.

## `apps/web/src/lib/` — web-only utilities

- `env.ts` + `env.test.ts`   env parsing/validation (server-only secrets)
- `utils.ts`            general helpers (`cn`, etc.)
- `doc-map.test.ts`     enforces that AGENTS.md / CLAUDE.md links resolve
- `fetch-json.test.ts`  tests for `fetchJson` (the implementation lives
                        in `packages/core/`)

Shared logic — `types.ts`, `sleeper.ts`, `fetch-json.ts`, `mock-data.ts` —
now lives in `packages/core/src/` and is imported as `@roster-loom/core`.

## `apps/web/src/utils/`

- `logger.ts`               pino-based structured logger
- `performance-logger.ts`   `startTimer` / `logDuration` for external calls
- `supabase/server.ts`      server-side Supabase client (App Router)
- `supabase/client.ts`      browser Supabase client

Anything that touches an external API should be timed with
`performance-logger.ts` — this is the convention recent commits have been
enforcing (see `git log --grep performance`).

## `apps/web/src/hooks/`

Standard React hooks (`use-mobile`, `use-toast`). Hook tests colocated.

## `apps/web/src/ai/`

Generative AI experiments. Currently just `dev.ts`. Not on the
production code path.

## `apps/web/src/middleware.ts`

Next.js middleware that refreshes Supabase sessions on every request.
If you add new authenticated routes, ensure they are covered by the
matcher.

## `supabase/migrations/`

Numbered SQL migrations are the **source of truth** for schema. Never
edit a committed migration — add a new one. After changes, regenerate
[references/database-schema.md](references/database-schema.md).

## Module boundaries (rules)

1. **Providers don't import providers.** `integrations/yahoo` must not
   import from `integrations/sleeper`. Cross-provider orchestration
   lives in `apps/web/src/app/actions.ts`.
2. **`'use server'` files don't get imported by client components**
   except through Server Actions. Keep React Server Component code in
   `page.tsx` / `layout.tsx`.
3. **Supabase access is centralized** in `apps/web/src/utils/supabase/`.
   Don't `createClient(...)` ad-hoc elsewhere.
4. **External calls go through `performance-logger`.** Wrap every fetch
   with `startTimer` / `logDuration`.
5. **`packages/core/` stays platform-neutral.** No React, no Next.js,
   no node/browser-only APIs — it has to run in both web and (eventually)
   React Native.
