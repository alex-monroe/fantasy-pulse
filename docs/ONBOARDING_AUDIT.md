# Developer Onboarding Audit

Point-in-time audit of `alex-monroe/fantasy-pulse` (Roster Loom) against
one question: **what does it cost someone who has never seen this repo to
become productive in it?**

**Status: phases 1–3 and 5–8 implemented; phase 4 partially.** The
findings below are preserved as written, as a record of what was true on
the audit date — several name files that have since been deleted. See
[Implementation status](#implementation-status) at the end for what
landed and what is still open.

Performed against `main` at `86f0b78` on 2026-08-31. Findings were
verified by running `npm install`, `npm test`, `npm run typecheck` and
`npm run lint` on a clean checkout, and by reading
`supabase/migrations/` against
[references/database-schema.md](references/database-schema.md).

## Diagnosis

The repo has more written guidance than most projects ten times its age:
a docs map, an architecture doc, per-provider READMEs, a demo mode with
its own walkthrough, and a Jest test that fails when a doc link rots.
That work is real and worth keeping.

What's missing is the layer underneath. The docs describe a system that
has drifted from the code, and the tooling that would have caught the
drift is either failing or not wired to CI. A newcomer's first day:
the README sends them to the wrong clone URL and the wrong port, they
find they can't start the app at all without credentials to a Supabase
project shared with another product, and when they run the checks the
docs tell them to run before review, two of three fail — with 79 errors
they didn't cause and can't distinguish from ones they did.

| Signal | State |
| ------ | ----- |
| `npm test` | 288 tests, 25 suites, all passing (~9s) |
| `npm run typecheck` | **79 errors** on clean `main` |
| `npm run lint` | **1 error** on clean `main` |
| CI gates on those three | **0 of 3** (Playwright only) |
| DB tables in the schema reference | **4 of 8** |
| Providers named in the docs | **3 of 4** |

## Findings

Severity: **Blocker** stops or misdirects a newcomer on day one.
**Drift** means docs and code disagree. **Cleanup** is surface area that
has to be read and shouldn't exist.

### A. The first run

**A1 · Blocker — you cannot run the app without credentials to a shared
production database.** There is no `supabase/config.toml` and no seed
file, so `npx supabase start` isn't wired up; there is no local Postgres
path at all. Every developer must be handed keys to the live OttoneuDB
project, which also hosts a sibling product's tables. Demo mode looks
like the escape hatch, but it sits *behind* the login gate — `getTeams()`
returns `'You must be logged in.'` before it reaches the demo branch
(`apps/web/src/app/actions.ts:1424-1446`).

**A2 · Blocker — the README is wrong in five ways.** Clone URL is
`fantasy-football-copilot` (repo is `fantasy-pulse`); Node "v18 or
later" (`.nvmrc` and `engines` say 20.x); opens `localhost:3000` (dev
server binds 9002); points at `.env.example` in the repo root (it's at
`apps/web/.env.example`); never mentions npm workspaces, `apps/mobile`,
or demo mode.

**A3 · Blocker — the README promises an AI assistant that doesn't
exist.** `apps/web/src/ai/` contains one file, `dev.ts`, which is two
lines calling `dotenv.config()`. ARCHITECTURE.md and
CODE_ORGANIZATION.md both describe the directory as "Generative AI
helpers" / "experiments."

**A4 · Blocker — `apps/mobile/README.md` is untouched create-expo-app
boilerplate** ("Welcome to your Expo app 👋", `npx expo start`,
`npm run reset-project`). It contradicts [MOBILE.md](MOBILE.md), which
is accurate.

**A5 · Drift — the test password is documented two ways.**
CONTRIBUTING.md says `test@test.com / test`; CLAUDE.md,
[TESTING.md](TESTING.md) and the Playwright specs say `testtest`, and
CLAUDE.md notes the 4-character password stopped working after the
May 2026 migration. CONTRIBUTING.md is the file a human reads.

### B. The feedback loop

**B1 · Blocker — `npm run typecheck` fails with 79 errors on a clean
checkout.** [COMMANDS.md](COMMANDS.md) and [TESTING.md](TESTING.md) both
tell contributors to run it before review. Because it has never been
green, nobody can separate their own mistakes from the baseline.

```
31  src/app/actions.test.ts
15  src/app/integrations/ottoneu/actions.test.ts
11  packages/core/src/mock-data.ts
 4  src/app/integrations/sleeper/actions.ts
 4  src/app/integrations/espn/actions.ts
 3  src/utils/supabase/server.ts
 3  src/app/integrations/yahoo/actions.test.ts
 1  packages/core/src/types.ts
 7  elsewhere
```

**B2 · Blocker — `npm run lint` also fails**, on an unescaped apostrophe
in `espn/page.tsx:172`. The root script chains workspaces with `&&`, so
while web lint is red the mobile app is never linted.

**B3 · Blocker — the build ignores both.** `next.config.ts` sets
`typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds:
true`. A type error can't fail the check, the build, or CI.

**B4 · Blocker — CI runs only the suite nobody may run locally.**
`.github/workflows/playwright.yml` is the only quality workflow; Jest,
lint and typecheck have no job. AGENTS.md, CLAUDE.md and TESTING.md all
forbid running Playwright locally. So the 288 fast tests that *are*
green are unenforced, and the only enforced suite is unreproducible.
`doc-map.test.ts`, which supposedly enforces the docs map, never runs in
CI either.

**B5 · Cleanup — test output is buried under performance logging.**
`performance-logger.ts` writes `[performance]` lines via `console.log`
during tests; a full run produces hundreds, making a real failure hard
to find.

### C. Where the docs and the code disagree

**C1 · Blocker — ESPN is a complete fourth provider absent from every
top-level doc.** It has actions, a page, tests, a 72-line README, a
migration adding `espn_s2`/`swid`, and a slot in `FantasyProvider`.
README, AGENTS.md, CLAUDE.md, ARCHITECTURE.md, CODE_ORGANIZATION.md,
adding-integrations.md and environment.md all still say "Sleeper, Yahoo,
and Ottoneu."

**C2 · Blocker — the documented provider pattern points at the wrong
file.** ARCHITECTURE.md and CODE_ORGANIZATION.md state that each
provider's `actions.ts` exports a `build<Provider>Teams`. None do. All
four builders live inside the 1,691-line `apps/web/src/app/actions.ts`.
This is the most misleading thing in the docs, because "add a provider"
is the most likely first real task.

**C3 · Drift — three rules are stated as law and not followed.**
React 18 in three docs vs. `react 19.1.0` pinned in the root
`overrides`; "never `console.log` in production paths" vs. 23 console
calls across 9 non-test files including `page.tsx` and `actions.ts`;
"external API calls are timed" vs. `sleeper/actions.ts` and
`ottoneu/actions.ts` not importing `performance-logger` at all.

**C4 · Drift — `database.types.ts` has never been committed.**
[COMMANDS.md](COMMANDS.md) and the `/db-types` skill both write to
`apps/web/src/lib/database.types.ts`; it isn't in the repo. Every
Supabase call is untyped — `from('fp_leagues').select('*')` returns
`any`, and a misspelled column is a runtime surprise.

**C5 · Drift — the least guessable integration has the thinnest
README.** Ottoneu is the only provider that scrapes HTML with JSDOM, and
its README is 9 lines. ESPN's is 72, Sleeper's 82, Yahoo's 121.

**C6 · Cleanup — the app is a PWA and no document says so.**
`next.config.ts` wraps the whole config in `next-pwa`, registering a
service worker and emitting `public/sw.js`. Stale-cache behaviour in
local dev is a baffling first bug.

**C7 · Cleanup — the doc-map test guards two of the ten orienting
files.** It checks links in AGENTS.md and CLAUDE.md only — which is
exactly why those two are the healthiest files here, and why README.md,
CONTRIBUTING.md and everything under `docs/` have been free to rot.

### D. The database

**D1 · Blocker — half the schema is missing from the schema
reference.** Migrations define eight tables;
[references/database-schema.md](references/database-schema.md) shows
DDL for four, describes `fp_teams` in prose, and omits the three MCP
OAuth tables entirely.

| Table | Defined | In the reference? |
| ----- | ------- | ----------------- |
| `fp_user_integrations` | 2025-09-06 | full DDL |
| `fp_leagues` | 2025-09-06 | full DDL |
| `fp_teams` | 2025-09-07 | prose only |
| `fp_notes` | renamed 2026-05-18 | full DDL |
| `fp_mcp_tokens` | 2026-07-28 | full DDL |
| `fp_mcp_oauth_clients` | 2026-08-23 | **absent** |
| `fp_mcp_oauth_codes` | 2026-08-23 | **absent** |
| `fp_mcp_oauth_tokens` | 2026-08-23 | **absent** |

**D2 · Drift — seven of the eight database functions are documented
nowhere.** The MCP migrations create eight `SECURITY DEFINER` functions;
the reference mentions one (`fp_mcp_token_owner`). The other seven are
called from `lib/mcp/oauth.ts`. Functions can't be discovered by
browsing tables, so they need documenting more than tables do.

**D3 · Drift — the reference's RLS claim contradicts its own
migrations.** It says `fp_mcp_tokens` "is the only table here with row
level security enabled"; the August OAuth migration enables RLS on three
more. ARCHITECTURE.md repeats the claim.

**D4 · Cleanup — every DB experiment lands on shared infrastructure.**
Because there's no local Postgres (A1), a newcomer's first migration and
first bad query run against the project that also serves a sibling
product. CLAUDE.md handles this with a warning, which works for agents;
an environment where the mistake is impossible would be better.

**D5 · Verify first — RLS on the four application tables.** No migration
enables row level security on `fp_user_integrations`, `fp_leagues`,
`fp_teams` or `fp_notes`. `fp_user_integrations` stores Yahoo OAuth
access and refresh tokens and ESPN `espn_s2`/`swid` cookies, while
[references/environment.md](references/environment.md) describes the
anon key — which ships in the browser bundle — as "Public —
RLS-protected."

Policies may have been added via the Supabase dashboard rather than a
migration, in which case there's no exposure. But that *is* the
onboarding finding: migrations are declared the source of truth, and if
the live security posture isn't in them, nobody reading this repo can
tell whether user data is protected. **This is the one finding that
could not be verified from the repository alone** — check the live
policy list, then either land the missing policies as a migration or
document explicitly which tables rely on server-side scoping instead.

### E. Code shape and surface area

**E1 · Drift — one 1,691-line file is both the hardest thing to learn
and the thing everything touches.** `apps/web/src/app/actions.ts` holds
the NFL scoreboard fetch, player-name normalization and fuzzy matching,
the Sleeper player cache, all four provider team-builders, the stock
projection scoring profile, and `getTeams`. It is the highest-churn file
in the repo.

**E2 · Drift — a circular import.** `app/actions.ts` imports five
functions from `yahoo/actions.ts`; `yahoo/actions.ts` imports
`getCurrentNflWeek` back from `app/actions.ts`.

**E3 · Cleanup — four functions named `getLeagues`, two named
`getTeams`.** Each provider exports its own `getLeagues` with a
different signature; Yahoo and ESPN each export a `getTeams` unrelated
to the top-level one. Only per-import aliasing keeps call sites
straight.

**E4 · Drift — the server Supabase client doesn't await `cookies()`.**
Next 15 made it async. `utils/supabase/server.ts` calls it synchronously
then awaits the `.get()` result — three of the 79 type errors, in the
file every server-side query goes through. `page.tsx` gets it right two
directories away, which is how it stayed hidden.

**E5 · Cleanup — env validation covers the optional vars, not the
required ones.** `lib/env.ts` validates the three Yahoo credentials with
Zod; the Supabase URL and anon key are read as `process.env.X!` in at
least three places. A typo yields an opaque runtime failure instead of a
named one.

**E6 · Cleanup — 20 of the 35 UI primitives are never imported.**
`components/ui/` is 4,299 lines; accordion, alert-dialog, avatar,
calendar, carousel, chart, checkbox, collapsible, dialog, dropdown-menu,
form, menubar, popover, progress, radio-group, sidebar, slider, switch,
tabs and textarea have no import outside the folder.

**E7 · Cleanup — dead dependencies and scripts.** `firebase` is a
production dependency with zero imports; `date-fns` likewise; `uuid` is
used only by the Playwright specs but declared as a web app dependency;
`apps/web/setup.sh` is referenced by environment.md and called by
nothing; `apps/web/src/ai/dev.ts` is imported by nothing.

## The plan

Eight phases, roughly six to eight focused days. The order matters —
each phase makes the next cheaper or safer, and the refactor sits late
because it's the only one that can break the product. Phases 1–3 are
what a new developer actually feels; Phase 8 is what stops this audit
being needed again.

### Phase 1 — Make the three checks honest (½–1 day)

*Everything downstream needs a signal you can trust. Until green means
green, no other change can be verified.*

- Clear the 79 type errors. 46 are in two test files and 11 are numeric
  literals in `packages/core/src/mock-data.ts`. Two are worth fixing
  properly rather than papering over: `SleeperEnrichedMatchup` extends
  `SleeperMatchup` with an incompatible `players` type (wants a separate
  interface), and the un-awaited `cookies()` in
  `utils/supabase/server.ts` (E4).
- Fix the lint error in `espn/page.tsx:172`; change the root `lint`
  script so mobile runs even when web fails.
- Then, and only then, delete `ignoreBuildErrors` and
  `ignoreDuringBuilds` from `next.config.ts`.
- Add `.github/workflows/ci.yml`: Node 20, `npm ci`, then lint,
  typecheck and `npm test`. The suite runs in ~9s, so it's a fast gate
  on every PR. Leave the Playwright workflow as it is.
- Silence `performance-logger` when `NODE_ENV === 'test'`.

**Done when** a fresh clone runs lint, typecheck and test all green, and
a PR that breaks any of the three fails CI.

### Phase 2 — A first run that needs no credentials (~1 day)

*This is the actual wall. Everything else here is a paper cut by
comparison. Do both halves; they solve different problems.*

- **Wire up local Supabase.** Add `supabase/config.toml`, a
  `supabase/seed.sql` creating the test user and a handful of `fp_`
  rows, and a `db:start` script. `npx supabase start` then gives every
  developer a private Postgres with the real schema — which also makes
  migrations safe to experiment with and removes the shared-project
  hazard (D4).
- **Let the instance-wide demo switch bypass the login gate.** Move the
  `isDemoModeEnv()` check in `getTeams` above the user lookup and show a
  demo banner. Keep the login gate for the `?demo=1` cookie and the
  `x-demo-mode` header — those are per-session opt-ins on a real
  deployment and must stay behind auth. Only a deliberately configured
  demo instance should skip it.
- Add a `DEMO_MODE=1` Vercel preview so reviewers can see the product
  with no account at all.

**Done when** `git clone && npm install && DEMO_MODE=1 npm run dev`
renders a live scoreboard with no credentials of any kind.

### Phase 3 — Rewrite the front door (~½ day)

*Cheap, and it's the first impression. Phase 2 lands first so the README
can open with the zero-credential path.*

- Rewrite README.md as a real quickstart: what the product is, the
  monorepo in six lines, the zero-credential run, the credentialed run,
  the three commands, a pointer to the docs map. Fix the clone URL, Node
  version, port and env-file path; delete the AI-assistant claim (A3).
- Replace `apps/mobile/README.md` with a pointer to [MOBILE.md](MOBILE.md).
- Reconcile the test password in CONTRIBUTING.md; add ESPN everywhere
  the other three providers are listed; correct React 18 → 19.
- Point `doc-map.test.ts` at README.md, CONTRIBUTING.md and every file
  under `docs/`, not just AGENTS.md and CLAUDE.md (C7).

**Done when** every claim in README.md is executable as written, and a
broken link in any orienting doc fails a test.

### Phase 4 — Make the database legible (~1 day)

*Start with the RLS question — if policies are missing it's a security
fix, not a docs fix, and it changes what the rest of this phase says.*

- **Resolve D5 first.** Audit the live project's policies on the four
  application tables. Land what's missing as a migration; correct the
  "RLS-protected" line in environment.md to match reality.
- Regenerate [references/database-schema.md](references/database-schema.md)
  so all eight tables carry real DDL, and add a section listing the
  eight RPC functions with signatures and callers (D2).
- **Commit `database.types.ts` and parameterize the clients as
  `createClient<Database>()`.** Highest-value single change for DB
  learnability: table and column names become autocomplete instead of
  folklore, and a typo becomes a compile error. `/db-types` already
  generates the file.
- Add a one-screen ERD — four application tables, four MCP tables, two
  foreign keys — at the top of the schema reference.
- Move the shared-project rule from CLAUDE.md into the schema reference
  too. Humans read `docs/`; only agents read CLAUDE.md.

**Done when** the schema reference matches `supabase/migrations/`
exactly, and a misspelled column fails `npm run typecheck`.

### Phase 5 — Shrink what has to be read (~½ day)

*Deleting code is the cheapest onboarding improvement available, and
it's safe now that Phase 1 tells you whether a deletion broke something.*

- Drop `firebase` and `date-fns`; move `uuid` to where the Playwright
  specs live. Run `npm install` and commit the lockfile in the same
  commit, per the repo's own rule.
- Delete the 20 unimported `components/ui/` files (~2,500 lines out of
  the directory newcomers browse to learn the component vocabulary).
  Any one comes back with a single shadcn command.
- Delete `apps/web/src/ai/` and `apps/web/setup.sh`, and their mentions
  in ARCHITECTURE.md, CODE_ORGANIZATION.md and environment.md.
- Document the PWA in ARCHITECTURE.md (C6) — or remove `next-pwa` if it
  isn't wanted. Either resolution beats an undocumented service worker.

**Done when** every file under `apps/web/src/` is reachable from
something that runs, and every dependency is imported somewhere.

### Phase 6 — Split the hot file so the docs become true (1–2 days)

*The riskiest phase and the only one that can break the product, so it
goes last, behind a green CI gate. Useful framing: the docs already
describe the structure this creates — you're moving the code to match
the documentation, not rewriting the documentation to match the code.*

- Move each `build<Provider>Teams` into its own
  `integrations/<provider>/actions.ts`, exactly as ARCHITECTURE.md has
  claimed all along (C2). `app/actions.ts` is left as orchestration:
  `getTeams`, the scoreboard fetch, the cross-team player-share merge.
- That move also kills the circular import (E2) — `getCurrentNflWeek`
  goes down with the Sleeper code or into a shared module.
- Lift the pure helpers — `normalizePlayerName`, `isStrongNameMatch`,
  `createSleeperIdResolver`, the stock projection scoring — into
  `packages/core/`. They have no I/O and are already covered by tests,
  so the move is mechanical, and the mobile app gets them for free.
- Rename the colliding exports (`getSleeperLeagues`, `getYahooLeagues`,
  …) so call sites stop needing aliases (E3).
- Write `docs/DATA_FLOW.md`: one request end to end, with real function
  names and file references. This is the mental model every other doc
  hangs off, and the hardest thing to reconstruct by reading.

**Done when** no file in `apps/web/src/app/` exceeds ~500 lines, there
are no import cycles, and adding a provider means touching only that
provider's folder plus one registration line.

### Phase 7 — Write the guided first contribution (~½ day)

*Only worth writing once phases 1–6 have made it honest. A day-one path
that fails halfway through is worse than none.*

- `docs/ONBOARDING.md`: run it with no credentials, read these three
  files in this order, make one specific small change, see it in the
  browser, open the PR. Under an hour, end to end.
- Point it at a real starter task. Expanding the Ottoneu README (C5) is
  a good one — it forces a careful read of the scraper, can't break
  production, and closes a genuine gap.
- Add a short "how this project makes decisions" note: why E2E is
  CI-only, why `packages/core` stays platform-neutral, why the `fp_`
  prefix exists. The rules are written down; the reasoning mostly isn't,
  and reasoning is what lets someone extend a convention rather than
  just obey it.

**Done when** someone who has never seen the repo opens a merged PR in
an afternoon without asking a question.

### Phase 8 — Make drift impossible to reintroduce (~1 day)

*Everything above is a one-time cleanup. This phase is what stops the
same audit being needed again in a year.*

The repo already ran the experiment that tells us what works.
`doc-map.test.ts` guards exactly two files — AGENTS.md and CLAUDE.md —
and those two are the most accurate documents here. Everything it
doesn't guard rotted. The same pattern holds at smaller scale: the
colocated provider READMEs, which live next to the code they describe,
are markedly more accurate than the central docs in `docs/`.

Two conclusions follow, and everything in this phase derives from them:
**a claim survives only if something executes it**, and **accuracy
decays with distance from the code**.

Why it drifted in the first place, so the fix isn't cargo-culted:

1. **Nothing was enforced.** CI gated only Playwright; six architectural
   rules in AGENTS.md, zero checks. An unenforced rule is worse than no
   rule — it teaches readers the docs are aspirational, and once someone
   learns that, they stop trusting the accurate parts too. That is why
   C3 matters more than its individual violations suggest.
2. **Machine-readable things were hand-maintained.** A hand-written
   snapshot of a Postgres schema is guaranteed to fall behind; a
   hand-typed provider list repeated across seven documents is
   guaranteed to miss the fourth provider.
3. **There is no new reader.** Drift is normally caught by someone
   getting confused. With one human author and a fleet of agents, nobody
   has been confused yet. This is the deepest cause and the one no lint
   rule fixes.

Work, in order of leverage:

- **Generalize the test that already works.** `doc-map.test.ts`
  validates markdown *links*; widen it to every backticked path-like
  token across all docs, plus every `npm run <script>` a doc mentions.
  This one test would have caught the missing `database.types.ts` (C4),
  the wrong `.env.example` path (A2), the dead `setup.sh` and the stale
  `src/ai/` descriptions (A3, E7).
- **Derive enumerations instead of typing them.** A test that reads the
  `integrations/` directory, asserts it matches the `FantasyProvider`
  union in `packages/core/src/types.ts`, and asserts every provider is
  named in README.md, ARCHITECTURE.md and CODE_ORGANIZATION.md. About 25
  lines, and the ESPN gap (C1) becomes impossible.
- **Turn the architectural rules into lint rules.** `apps/web/.eslintrc.json`
  is three lines today. Four of the six rules in AGENTS.md are pure
  `no-restricted-imports` config, no custom rule authoring: providers
  don't import providers; Supabase access stays in `utils/supabase/`;
  `packages/core` imports no React/Next/React Native/node builtins;
  `no-console` outside the logger. The performance-logger rule needs a
  heuristic (a file calling `fetch(` must import it) — crude, but that
  heuristic is exactly what would have caught Sleeper and Ottoneu (C3).
- **Make generated artifacts fail CI when stale.** Regenerate
  `database.types.ts` and the schema reference in CI, then
  `git diff --exit-code`. This is the structural fix for the whole D
  group: stop hand-maintaining a snapshot of a machine-readable thing.
  Much easier once Phase 2 lands `config.toml`, because CI can generate
  from a local Postgres instead of needing production credentials.
- **Keep prose away from specifics.** Documentation that names a
  particular function or file is a liability unless a test asserts it.
  ARCHITECTURE.md should describe stable shapes — data flow, boundaries,
  the *why* — and link to code for specifics rather than restating them.
  C2 is the cautionary example: it named the exact file each
  `build<Provider>Teams` lives in, which was true once.

**What no check can catch.** Nothing above would flag the README's
promised AI assistant (A3) — no test detects documentation of a feature
that was never built. The cure is the fresh reader the project doesn't
have, and it can be manufactured cheaply: a scheduled job that takes a
clean container, follows the README *literally*, and reports every
divergence. That is exactly how A1 through A3 were found, and none of
them would have failed a unit test. Monthly is plenty. The existing
`/retro` skill is aimed at this target already; it just looks at
conversation friction rather than doc-versus-reality.

**The standing rule.** Every rule in AGENTS.md is either enforced by a
check or deleted — no third category. A new rule ships with its check in
the same PR, or it ships as guidance ("prefer…") rather than law. That
keeps the document short, and keeps every remaining line true.

**Done when** every architectural rule in AGENTS.md has a corresponding
failing-test-if-violated, and no document contains a hand-maintained
list of something the code already knows.

## What's already working

Worth naming, because the plan preserves all of it and several phases
extend ideas already here.

- **The docs map and the test behind it.** A machine-checked
  documentation index is rare and effective — AGENTS.md and CLAUDE.md
  are the healthiest files here precisely because a test guards them.
  Phase 3 only widens its scope.
- **Demo mode.** A deterministic, self-updating fake slate behind a
  single seam, so web, mobile and the refresh endpoint all get it for
  free. Phase 2 only removes the login gate in front of it.
- **Colocated provider READMEs** with captured API payloads. The ESPN
  one, explaining why that provider can't work like the others, is the
  best single page in the repo.
- **The `fp_` prefix convention.** A visible boundary on a shared
  database, obvious in every query.
- **288 fast, honest tests** across 25 suites, running in ~9 seconds.
  A real asset that CI currently ignores.
- **The agent permission list** in `.claude/settings.json` — carefully
  considered, and a good model for the human-facing "how we work here"
  note proposed in Phase 7.

## Implementation status

Worked through in order; each phase is one commit, and lint, typecheck,
the full Jest suite and a production build were green at every step.

| Phase | State | Notes |
| ----- | ----- | ----- |
| 1 — honest checks | **done** | 79 type errors and 1 lint error cleared, `ignoreBuildErrors` removed, `.github/workflows/ci.yml` added |
| 2 — zero-credential run | **done** | `DEMO_MODE=1 npm run dev` needs no account; local Supabase config + seed added |
| 3 — front door | **done** | README, mobile README, CONTRIBUTING, ESPN everywhere, React 19, widened doc-map test |
| 4 — database | **partial** | Schema reference now covers all 8 tables and 8 functions; **`database.types.ts` and the RLS audit are still open** |
| 5 — surface area | **done** | 20 UI components and 21 dependencies removed |
| 6 — split the orchestrator | **done** | `actions.ts` 1,726 → 342 lines; cycle broken; `DATA_FLOW.md` added |
| 7 — first contribution | **done** | `docs/ONBOARDING.md` |
| 8 — drift prevention | **done** | 4 lint rules, 3 doc-invariant tests, enforcement table |

### Still open

1. **D5 — the RLS question.** Unchanged and unanswered: no migration
   enables row level security on the four app tables, and confirming the
   live project's policies needs dashboard access. The schema reference
   now flags this explicitly rather than implying protection. **This is
   the one item worth doing next**, because if policies really are
   missing it is a security fix, not a documentation one.
2. **C4 — `database.types.ts`.** Generating it needs Docker or the
   linked project, neither available in the environment this work was
   done in. `/db-types` documents both paths, and notes that generating
   the file is only half the job — the `Database` type also has to be
   threaded through the three Supabase clients, or every query still
   returns `any`.
3. **`npm run db:start` has not been executed end to end.** Docker was
   unavailable. `config.toml` parses and the seed is plain SQL against
   the migrated schema, but the first person with Docker should run it
   and fix whatever it says.

### Deviations from the plan as written

- Phase 6 proposed lifting the name-matching helpers into
  `packages/core/`. They went to `apps/web/src/lib/nfl/` instead: they
  depend on `string-similarity`, and adding a dependency to the
  platform-neutral package for code the mobile app never calls is a bad
  trade. The rule that mattered — providers not importing providers —
  is satisfied either way, and is now lint-enforced.
- Phase 6 also put each `build<Provider>Teams` in a new `build-teams.ts`
  rather than merging it into the provider's `actions.ts`. The existing
  tests mock the provider's data functions, and intra-module calls don't
  go through the module namespace, so merging would have required
  rewriting roughly 700 lines of tests. A sibling module preserves the
  mock boundaries exactly.
- Phase 7 was written during Phase 3, because the widened doc-map test
  caught the dangling link to it immediately.
