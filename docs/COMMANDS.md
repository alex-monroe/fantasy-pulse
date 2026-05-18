# Commands

Every CLI command you need, grouped by domain. Package manager is **npm**.

This is an npm-workspaces monorepo. Most scripts can be run from the
repo root and will delegate into `apps/web/`; you can also run them
directly from `apps/web/` if you prefer.

## Setup

```bash
nvm use                                    # picks Node 20 from .nvmrc
npm install                                # installs all workspaces
cp apps/web/.env.example apps/web/.env.local   # fill in Supabase + Yahoo credentials
```

See [references/environment.md](references/environment.md) for what each
env var does.

## Dev server

```bash
npm run dev             # Next.js dev server with Turbopack on http://localhost:9002
```

Note: dev port is **9002**, not 3000. Playwright assumes this port.

## Build / start (production)

```bash
npm run build           # next build
npm start               # next start (after build)
```

## Tests

```bash
npm test                # Jest unit tests (jsdom)
npm test -- path/to/file.test.ts   # single file
npm test -- -t "name"   # by test name pattern
```

E2E tests exist but are **not run locally or by agents** — see
[TESTING.md](TESTING.md) for why.

## Lint + types

```bash
npm run lint            # next lint
npm run typecheck       # tsc --noEmit
```

Run both before pushing. CI does not currently gate on them, but reviewers will.

## Supabase

The Supabase CLI is installed as a dev dependency.

```bash
npx supabase migration new <name>   # create a new SQL migration
npx supabase db diff                # generate a migration from local changes
npx supabase db push                # apply migrations to the linked project
npx supabase gen types typescript --linked > apps/web/src/lib/database.types.ts
```

After changing schema, regenerate the schema reference at
[references/database-schema.md](references/database-schema.md).

## Git + PRs

```bash
git checkout main && git pull origin main
git checkout -b <type>/<short-description>
# ... commit ...
git push -u origin HEAD
gh pr create --fill
```

See [GIT_WORKFLOW.md](GIT_WORKFLOW.md) for the full workflow.

## Dependencies

After **any** change to `package.json`:

```bash
npm install             # regenerates package-lock.json
git add package.json package-lock.json
```

CI uses the lockfile; commits without an updated lockfile will fail to install.
