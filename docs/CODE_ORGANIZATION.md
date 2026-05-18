# Code Organization

Where things live and why. Pair this with [ARCHITECTURE.md](ARCHITECTURE.md).

## `src/app/` — Next.js App Router

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

## `src/app/integrations/<provider>/` — provider modules

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

## `src/components/`

- Top-level: app-specific components (`home-page.tsx`,
  `player-card.tsx`, `app-navigation.tsx`, `matchup-priority-selector.tsx`)
- `components/ui/`: shadcn/Radix primitives — treat as generated/library
  code; only edit if you'd accept the change upstream.

Component tests are colocated as `<name>.test.tsx` next to the implementation.

## `src/lib/` — shared utilities

- `types.ts`            shared TS types (Team, Player, SleeperLeague, etc.)
- `sleeper.ts`          Sleeper-specific helpers reused across providers
- `env.ts` + `env.test.ts`   env parsing/validation
- `fetch-json.ts`       typed JSON fetch wrapper with retry semantics
- `mock-data.ts`        fixtures for tests and dev
- `utils.ts`            general helpers (`cn`, etc.)

## `src/utils/`

- `logger.ts`               pino-based structured logger
- `performance-logger.ts`   `startTimer` / `logDuration` for external calls
- `supabase/server.ts`      server-side Supabase client (App Router)
- `supabase/client.ts`      browser Supabase client

Anything that touches an external API should be timed with
`performance-logger.ts` — this is the convention recent commits have been
enforcing (see `git log --grep performance`).

## `src/hooks/`

Standard React hooks (`use-mobile`, `use-toast`). Hook tests colocated.

## `src/ai/`

Generative AI experiments. Currently just `dev.ts`. Not on the
production code path.

## `src/middleware.ts`

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
   lives in `src/app/actions.ts`.
2. **`'use server'` files don't get imported by client components**
   except through Server Actions. Keep React Server Component code in
   `page.tsx` / `layout.tsx`.
3. **Supabase access is centralized** in `src/utils/supabase/`. Don't
   `createClient(...)` ad-hoc elsewhere.
4. **External calls go through `performance-logger`.** Wrap every fetch
   with `startTimer` / `logDuration`.
