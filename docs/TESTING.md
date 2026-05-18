# Testing

## Unit tests (Jest)

- Runner: Jest 29 with `next/jest` config (`jest.config.js`)
- Env: `jsdom` (so React component tests work out of the box)
- Setup: `jest.setup.ts` (jest-dom matchers)
- Pattern: tests are **colocated** next to the implementation as
  `*.test.ts` / `*.test.tsx` (e.g. `src/app/actions.test.ts`,
  `src/components/player-card.test.tsx`).
- `e2e/` is excluded from Jest via `testPathIgnorePatterns`.

Run:

```bash
npm test
npm test -- src/app/actions.test.ts
npm test -- -t "buildSleeperTeams"
```

When adding a new module under `src/app/integrations/<provider>/actions.ts`,
add a sibling `actions.test.ts` — every existing provider follows this rule.

## E2E tests (Playwright) — do not run locally

E2E tests live under `e2e/` and are configured in `playwright.config.ts`
(base URL `http://localhost:9002`, mocks injected via
`e2e/mocks/external-apis.js`).

**Agents must not run `npm run test:e2e`.** They are flaky, slow, and
depend on a populated Supabase project. CI runs them on every push/PR
via `.github/workflows/playwright.yml` and publishes a report to GitHub
Pages; rely on that signal, not local runs.

If you genuinely need to debug an E2E failure, do it in the CI report
or hand it back to the human.

## Test credentials

For any login step in automated tests:

- Email: `test@test.com`
- Password: `test`

## Lint and types

`npm run lint` and `npm run typecheck` are not formal "tests" but are
the next-fastest correctness signal. Run both before requesting review.

## CI

`.github/workflows/playwright.yml`:

- triggers: push and PR to `main`
- runs `npx playwright test` with real Supabase secrets
- uploads the HTML report to GitHub Pages and comments the URL on the PR
- the job fails if any Playwright test fails

There is no separate unit-test job today. If you want one, add it as a
standalone PR rather than bundling it with feature work.
