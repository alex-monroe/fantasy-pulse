# Git Workflow

## Branching

- `main` is the only long-lived branch.
- **Never commit directly to `main`.** Every change goes through a PR.
- Always branch from an up-to-date `main`:

  ```bash
  git checkout main
  git pull origin main
  git checkout -b <type>/<short-description>
  ```

Branch name conventions (loose — match what shows up in `git log`):

- `feat/...`  new user-visible feature
- `fix/...`   bug fix
- `chore/...` deps, tooling, refactors with no behavior change
- `docs/...`  documentation only
- `setup/...` repo infrastructure (e.g. `setup/harness-engineering`)

## Commits

- Imperative, sentence-case subject (`Add celebratory animation for refreshed scores`)
- Recent history is the style guide — `git log --oneline -20` shows the
  expected tone (often one-line summaries of the PR title).
- Keep dependency bumps to their own commits/PRs (`chore: upgrade ...`).
- After any `package.json` change, also stage the regenerated
  `package-lock.json` in the same commit.

## Pull requests

GitHub repo: `alex-monroe/fantasy-pulse`. Open every PR with `gh`:

```bash
git push -u origin HEAD
gh pr create --fill        # or --title / --body for custom text
```

Expectations:

- PRs target `main`.
- CI (Playwright) must be green before merge.
- The PR description should explain the *why*; the diff already shows the *what*.
- Bundle related changes — don't split refactors into 5 trivial PRs unless
  there's a real reason.

## What not to do

- Don't force-push to `main` (it's the default and protected by convention).
- Don't `git commit --no-verify` to skip hooks unless the user explicitly asks.
- Don't run E2E tests locally to gate merging — rely on the CI report.
- Don't amend a published commit; add a new commit instead.
