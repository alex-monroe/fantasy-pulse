# Onboarding

Your first hour on Roster Loom. Follow it top to bottom — every command
here is expected to work on a clean clone, and if one doesn't, that's a
bug worth reporting.

## 1. Run it (5 minutes, no credentials)

```bash
git clone https://github.com/alex-monroe/fantasy-pulse.git
cd fantasy-pulse
nvm use            # Node 20.x
npm install
DEMO_MODE=1 npm run dev
```

Open <http://localhost:9002>. You should see a scoreboard with a "Demo
data" banner, full rosters, live game clocks, and scores that climb
every 30 seconds.

That's the whole product. Demo mode swaps only the *data source* —
routing, team building, player grouping, the matchup report and both UIs
are the real production code. See [DEMO_MODE.md](DEMO_MODE.md).

## 2. Confirm the checks are green (2 minutes)

```bash
npm run lint
npm run typecheck
npm test
```

All three pass on a clean checkout, and all three gate every PR in CI.
This matters more than it sounds: it means when one goes red, *you* did
it, and you can trust the signal. If you ever find one red on `main`,
that's a bug — fix it or say so, don't work around it.

Don't run `npm run test:e2e`. Playwright is CI-only here;
[TESTING.md](TESTING.md) explains why.

## 3. Read these three files, in this order (20 minutes)

Read for shape, not detail. You are building a mental model, not
memorising an API.

1. **`packages/core/src/types.ts`** — the domain. `Team`, `Player`,
   `LeagueRef`, `FantasyProvider`. Every other file moves these around.
   The whole app is "turn four different providers' payloads into
   `Team[]`, then render it."

2. **`apps/web/src/app/actions.ts`** — the orchestrator. Start at
   `getTeams()` at the bottom: it resolves the user, fans out to every
   connected provider in parallel, merges the results, and counts how
   many of your teams each player appears on. This is the single seam
   the web render, the mobile app, demo mode and the MCP server all sit
   behind.

3. **One provider, end to end** — pick
   `apps/web/src/app/integrations/sleeper/`. Read its `README.md`, then
   `actions.ts`, then `actions.test.ts`. Sleeper is the simplest of the
   four (no auth, public JSON API). Once you've read one, the other
   three differ mainly in how they authenticate — see the table in
   [adding-integrations.md](adding-integrations.md).

Then skim [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram
and [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) for where everything
else lives.

## 4. Make one small change (15 minutes)

Something visible, so the loop closes:

- Open `apps/web/src/components/player-card.tsx`.
- Change something you can see — a label, a spacing class, the way a
  score is formatted.
- The dev server hot-reloads. Confirm it in the browser.
- Run `npm test` and watch `player-card.test.tsx` still pass.
- Revert it.

You now know how to find a component, change it, see it, and test it.

## 5. Pick up a real task

A good first contribution is expanding
`apps/web/src/app/integrations/ottoneu/README.md`. It's nine lines, for
the only provider that works by scraping HTML — the most fragile and
least guessable code in the repo. Writing it forces you to read the
scraper closely, it can't break production, and it closes a real gap
that the other three providers don't have.

Then: branch, commit, PR. [GIT_WORKFLOW.md](GIT_WORKFLOW.md) has the
conventions.

## Working with a database

Demo mode gets you a long way, but real provider data needs Postgres.

```bash
npm run db:start     # local Supabase in Docker: migrations + seed
```

This gives you a private database carrying the real schema, seeded with
the test account `test@test.com` / `testtest`. Migrations are safe to
experiment against here.

Prefer this over the hosted project. The hosted database is **shared
with an unrelated repo** — every table Roster Loom owns is prefixed
`fp_`, and anything without that prefix belongs to the other product.
See [references/database-schema.md](references/database-schema.md).

## Why the project is set up the way it is

Conventions are easier to extend than to obey, so here is the reasoning
behind the ones you'll bump into:

- **E2E is CI-only.** The Playwright suite needs browsers and a
  populated Supabase project, and it's slow and flaky enough that a
  local red doesn't mean much. CI runs it on every PR and posts a report
  link. The fast checks in step 2 are the ones you iterate on.

- **`packages/core/` is platform-neutral.** No React, no Next.js, no
  `window`, no `fs`. The mobile app imports it, so anything that can't
  run in React Native belongs in an app instead. This is why the pure
  logic — matchup grouping, player status, the demo generator — lives
  there and the I/O doesn't.

- **Providers don't import providers.** Yahoo may not import from
  Sleeper. Cross-provider work belongs in `app/actions.ts`. Four
  providers with four different auth models get tangled fast otherwise,
  and the fan-out has to stay parallelisable.

- **Every table is prefixed `fp_`.** The Supabase project is shared. The
  prefix makes the ownership boundary visible in every single query
  rather than something you have to remember.

- **Schema changes are migrations, never dashboard edits.**
  `supabase/migrations/` is the source of truth. A change made in the
  Supabase UI is invisible to everyone else and to CI.

- **Docs claims get tests where possible.** `doc-map.test.ts` fails when
  a doc link breaks; another test fails when a provider is added without
  the docs following. If you add a rule, add its check —
  [ONBOARDING_AUDIT.md](ONBOARDING_AUDIT.md) Phase 8 explains why.

## When something doesn't work

- **Port 9002 already in use** — the dev server, Playwright config and
  the Yahoo redirect URI all assume it. Free the port rather than
  changing it.
- **Stale UI that won't update** — the app registers a service worker
  (`next-pwa`). Hard-reload, or unregister it in DevTools →
  Application.
- **`npm ci` fails on the lockfile** — someone changed `package.json`
  without committing the regenerated `package-lock.json`. Run
  `npm install` and commit both.
- **Anything in this document is wrong** — that's the bug. Fix it in the
  same PR as whatever you were doing.
