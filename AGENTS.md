# AGENTS.md

Universal instructions for AI coding agents working on **Roster Loom**
(repo: `alex-monroe/fantasy-pulse`).

## Project Overview

A one-stop fantasy football scoreboard. Users connect Sleeper, Yahoo,
Ottoneu and ESPN accounts; the app aggregates their teams and renders live
matchup data with cross-team player-share indicators.

- **Tech stack:** Next.js 15.3.6 (App Router) · React 19 · TypeScript 5 · Tailwind 3 · Supabase (Postgres + Auth) · Jest 29 · Playwright 1.55
- **Monorepo:** npm workspaces. Web app at `apps/web/`; mobile app at `apps/mobile/` (Expo / React Native); shared code at `packages/core/` (`@roster-loom/core`). See [docs/MOBILE.md](docs/MOBILE.md) for the mobile quickstart.
- **Package manager:** **npm** (lockfile is committed; CI requires it in sync)
- **Node:** **20.x** (from `.nvmrc` and `engines`)
- **Dev port:** **9002** (not 3000)

## Quick Reference

- **Start here (new dev):** [docs/ONBOARDING.md](docs/ONBOARDING.md) — first hour, guided
- **Commands:** [docs/COMMANDS.md](docs/COMMANDS.md) — every CLI command
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data flow, provider pattern
- **Code layout:** [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) — where things live, module rules
- **Testing:** [docs/TESTING.md](docs/TESTING.md) — Jest setup, why E2E is off-limits
- **Git workflow:** [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) — branch + PR rules
- **Add a provider:** [docs/adding-integrations.md](docs/adding-integrations.md)
- **Mobile app:** [docs/MOBILE.md](docs/MOBILE.md)
- **MCP server:** [docs/MCP.md](docs/MCP.md) — hosted AI-assistant access
- **DB schema:** [docs/references/database-schema.md](docs/references/database-schema.md)
- **Env vars:** [docs/references/environment.md](docs/references/environment.md)
- **Onboarding gaps:** [docs/ONBOARDING_AUDIT.md](docs/ONBOARDING_AUDIT.md) — audit + remediation plan

## Documentation Map

```
AGENTS.md                          <- you are here (universal entry point)
CLAUDE.md                          # Claude-Code-specific extensions
CONTRIBUTING.md                    # Human contributor pointer (mostly defers here)
apps/web/                          # Next.js web app
apps/mobile/                       # Expo / React Native app
packages/core/                     # @roster-loom/core — shared logic + types
supabase/                          # Migrations (shared OttoneuDB)
docs/
├── ARCHITECTURE.md                # System design, tech stack, data flow
├── COMMANDS.md                    # All CLI commands grouped by domain
├── CODE_ORGANIZATION.md           # File layout, module boundaries, conventions
├── TESTING.md                     # Jest setup, E2E policy, CI signals
├── GIT_WORKFLOW.md                # Branch + PR rules
├── ONBOARDING.md                  # New-developer first hour
├── ONBOARDING_AUDIT.md            # Onboarding audit (2026-08-31) + phased plan
├── MOBILE.md                      # Mobile app quickstart (Expo Go, env, layout)
├── MCP.md                         # Hosted MCP server: tools, tokens, transport
├── adding-integrations.md         # How to add a new fantasy provider
├── blueprint.md                   # Original product brief (style + features)
└── references/
    ├── database-schema.md         # Snapshot of Supabase schema (regen after migrations)
    └── environment.md             # Env var reference
```

Per-provider docs are colocated with their code under
`apps/web/src/app/integrations/<provider>/README.md`.

## Code Style

- TypeScript everywhere. No new `.js` files in `apps/web/src/`.
- Server-only modules start with `'use server';` — keep client and
  server boundaries explicit.
- Tests are **colocated** as `<name>.test.ts(x)` next to implementation.
- Tailwind for styling; reuse shadcn primitives in `apps/web/src/components/ui/`
  before hand-rolling.
- Inside `apps/web/`, import via the `@/...` alias (mapped to `apps/web/src/`).
- Shared business logic (types, Sleeper helpers, `fetchJson`) lives in
  `packages/core/`; import it as `@roster-loom/core`.
- Log structured data via `apps/web/src/utils/logger.ts`; never `console.log`
  in production paths.

## Architectural Rules

1. **Providers don't import providers.** `integrations/yahoo` may not
   import from `integrations/sleeper`. Cross-provider work lives in
   `apps/web/src/app/actions.ts`.
2. **Supabase access is centralized** in `apps/web/src/utils/supabase/`
   (`server.ts` for RSC/route handlers, `client.ts` for the browser).
3. **External API calls are timed.** Wrap them with `startTimer` /
   `logDuration` from `apps/web/src/utils/performance-logger.ts`.
4. **Schema changes happen via new SQL migrations** under
   `supabase/migrations/`. Never edit a committed migration. Regenerate
   `docs/references/database-schema.md` afterward.
5. **Every new provider follows the five-file pattern**
   (`actions.ts`, `actions.test.ts`, `page.tsx`, `README.md`,
   `*.example.json`) — see [docs/adding-integrations.md](docs/adding-integrations.md).
6. **Web-only deps stay in `apps/web/`.** Anything in `packages/core/`
   must not import React, Next.js, or browser-only modules — the mobile
   app will share it.

## Critical Rules

- **Do not run `npm run test:e2e`.** Playwright tests are flaky and
  CI-only; rely on the workflow comment posted on each PR.
- **Skip `frontend_verification`** if your harness offers it — it's
  unreliable here.
- **After any `package.json` change, run `npm install`** and commit the
  regenerated `package-lock.json` in the same commit; CI breaks otherwise.
- **Never commit directly to `main`.** Branch off, push, open a PR with
  `gh pr create`.
- **Test credentials** for any login step: `test@test.com` / `testtest`.
- **Update the docs map** when you add/rename files referenced from
  `AGENTS.md` or `CLAUDE.md`. A Jest test enforces this — see
  `apps/web/src/lib/doc-map.test.ts`.
