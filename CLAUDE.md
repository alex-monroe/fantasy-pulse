# CLAUDE.md

Guidance for [Claude Code](https://claude.com/claude-code) working on
**Roster Loom** (`alex-monroe/fantasy-pulse`). This file extends
[AGENTS.md](AGENTS.md) with Claude-specific details.

## Project Overview

Roster Loom aggregates Sleeper, Yahoo, and Ottoneu fantasy football
teams into a single live scoreboard. The home page fans out to
1–3 external APIs per render, so performance discipline (batched fetches,
token reuse, caching) matters more than feature volume.

- **Tech stack:** Next.js 15.3.6 (App Router, Turbopack) · React 18 · TypeScript 5 · Tailwind 3 · Supabase · Jest 29 · Playwright 1.55
- **Package manager:** `npm` — never use `pnpm` or `yarn` in this repo
- **Node:** `nvm use` will pick **20.x** from `.nvmrc`
- **Dev port:** **9002** (set in `package.json`; Playwright + Yahoo redirect URI assume it)

## Quick Reference

- **Commands:** [docs/COMMANDS.md](docs/COMMANDS.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Code layout:** [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md)
- **Testing:** [docs/TESTING.md](docs/TESTING.md)
- **Git workflow:** [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
- **Add a provider:** [docs/adding-integrations.md](docs/adding-integrations.md)
- **DB schema:** [docs/references/database-schema.md](docs/references/database-schema.md)
- **Env vars:** [docs/references/environment.md](docs/references/environment.md)

## Skills (`.claude/commands/`)

- `/run-tests` — `npm test` (Jest only; e2e is off-limits)
- `/start-dev` — `npm run dev` on port 9002
- `/create-pr` — push current branch and open a PR with `gh`
- `/db-types` — regenerate Supabase TS types and the schema reference
- `/retro` — review the conversation for friction and propose doc/skill updates

## MCP servers

`.mcp.json` enables `supabase` and `github` MCP servers (gated by
`.claude/settings.local.json`). Prefer the MCP tools over shelling
out for those services when available.

## Documentation Map

```
AGENTS.md                          # Universal entry point
CLAUDE.md                          <- you are here
CONTRIBUTING.md                    # Human contributor pointer
.claude/commands/                  # Claude Code skills
docs/
├── ARCHITECTURE.md                # System design, tech stack, data flow
├── COMMANDS.md                    # All CLI commands grouped by domain
├── CODE_ORGANIZATION.md           # File layout, module boundaries
├── TESTING.md                     # Jest setup, E2E policy, CI signals
├── GIT_WORKFLOW.md                # Branch + PR rules
├── adding-integrations.md         # How to add a new fantasy provider
├── blueprint.md                   # Original product brief
└── references/
    ├── database-schema.md         # Supabase schema snapshot
    └── environment.md             # Env var reference
```

## GitHub Repository

- Owner / name: **`alex-monroe/fantasy-pulse`** (note: the user-facing
  product name is "Roster Loom" but the repo is `fantasy-pulse`)
- Default branch: `main`
- CI: `.github/workflows/playwright.yml` runs on push + PR to `main`

## Critical Rules

- **Do not run `npm run test:e2e`.** Rely on the CI report linked from
  the PR comment.
- **Skip the `frontend_verification` tool** if your harness offers it.
- **After any `package.json` change**, run `npm install` and commit the
  regenerated `package-lock.json` in the same commit.
- **Never commit directly to `main`.** Branch, push, `gh pr create`.
- **Test credentials:** `test@test.com` / `test`.
- **Update the docs map** when you add/rename files referenced from
  `AGENTS.md` or `CLAUDE.md`. The Jest test in `src/lib/doc-map.test.ts`
  will fail otherwise.
- **Shared Supabase project (OttoneuDB).** This project is shared with
  another repo. Every table owned by **this** repo is prefixed `fp_`
  (for fantasy-pulse): `fp_user_integrations`, `fp_leagues`, `fp_teams`,
  `fp_notes` (plus the standard `auth.*` / `storage.*` schemas managed
  by Supabase). Any non-`fp_` public table you see via the `supabase`
  MCP tools belongs to the sibling repo — **do not** drop, alter,
  rename, or suggest "cleaning up" those tables, and do not assume
  their presence indicates a bug here. When adding new tables in this
  repo, give them an `fp_` prefix. If a schema change here would
  affect a non-`fp_` table, stop and ask.
