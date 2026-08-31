# Roster Loom

One scoreboard for all of your fantasy football teams. Connect Sleeper,
Yahoo, Ottoneu and ESPN accounts and Roster Loom aggregates every roster
into a single live view — who you have playing, who you're playing
against, and which players are quietly on three of your teams at once.

Repo is `alex-monroe/fantasy-pulse`; the product is "Roster Loom".

## Try it in one minute

No account, no database, no credentials:

```bash
git clone https://github.com/alex-monroe/fantasy-pulse.git
cd fantasy-pulse
nvm use                      # Node 20.x, from .nvmrc
npm install
DEMO_MODE=1 npm run dev      # then open http://localhost:9002
```

Demo mode serves deterministic fake data that looks like a Sunday
mid-slate — full rosters, live game clocks, scores that climb every 30
seconds. Every other part of the app is the real production code path.
See [docs/DEMO_MODE.md](docs/DEMO_MODE.md).

Note the port: **9002**, not 3000.

## Repository layout

npm workspaces monorepo. Use `npm` — never `pnpm` or `yarn`.

```
apps/web/        Next.js 15 app (App Router). This is what Vercel deploys.
apps/mobile/     Expo / React Native app — see docs/MOBILE.md
packages/core/   @roster-loom/core — types and logic shared by both apps
supabase/        SQL migrations, local stack config, seed data
docs/            Everything below
```

## Running against real data

You need a database and, for Yahoo, OAuth credentials.

### 1. A database

Local Postgres is the recommended path — it carries the real schema, it
is safe to experiment against, and it keeps you off the shared hosted
project. Needs Docker.

```bash
npm run db:start     # applies migrations + seed, prints a URL and anon key
```

The seed creates the test account `test@test.com` / `testtest`.

To use the hosted project instead, see
[docs/references/environment.md](docs/references/environment.md).

### 2. Environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in the Supabase URL and anon key (`npm run db:start` prints both
for the local stack). Yahoo credentials are only needed if you're
working on the Yahoo integration; Sleeper and Ottoneu need none, and
ESPN uses cookies you paste into the UI.

Full reference: [docs/references/environment.md](docs/references/environment.md).

### 3. Run it

```bash
npm run dev          # http://localhost:9002
```

Register at `/register`, then connect a provider from `/integrations`.

## The three checks

```bash
npm run lint
npm run typecheck
npm test
```

All three pass on a clean checkout and all three gate every PR in CI. If
one fails, you broke it. E2E tests exist but are CI-only — see
[docs/TESTING.md](docs/TESTING.md) for why.

## Documentation

| Doc | What's in it |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, the provider pattern |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | One request end to end, with file references |
| [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) | Where things live, module boundaries |
| [docs/COMMANDS.md](docs/COMMANDS.md) | Every CLI command, grouped by domain |
| [docs/TESTING.md](docs/TESTING.md) | Jest setup, the E2E policy, CI signals |
| [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) | Branching and PR rules |
| [docs/DEMO_MODE.md](docs/DEMO_MODE.md) | Fake-data mode, for out-of-season work |
| [docs/MOBILE.md](docs/MOBILE.md) | Expo app quickstart |
| [docs/MCP.md](docs/MCP.md) | The hosted MCP server for AI assistants |
| [docs/adding-integrations.md](docs/adding-integrations.md) | Adding a fantasy provider |
| [docs/references/database-schema.md](docs/references/database-schema.md) | Supabase schema |
| [docs/references/environment.md](docs/references/environment.md) | Env var reference |

Per-provider notes live next to their code, under
`apps/web/src/app/integrations/<provider>/README.md`.

AI coding agents should start at [AGENTS.md](AGENTS.md) or
[CLAUDE.md](CLAUDE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Branch off `main`, open a PR,
keep CI green.

## License

[MIT](LICENSE).
