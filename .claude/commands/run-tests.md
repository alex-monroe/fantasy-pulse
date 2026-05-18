---
description: Run the Jest unit test suite
---

Run the unit tests. **Do not run the e2e suite** — see
[docs/TESTING.md](../../docs/TESTING.md) for why.

```bash
npm test
```

To target a single file or test name:

```bash
npm test -- src/app/actions.test.ts        # path resolves from apps/web/
npm test -- -t "buildSleeperTeams"
```

After tests pass, also run lint and types before reporting success:

```bash
npm run lint
npm run typecheck
```
