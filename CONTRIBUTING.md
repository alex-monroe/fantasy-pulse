# Contributing to Roster Loom

Thanks for your interest! Most of what you need lives in the docs.

## For humans

- **Local setup, env vars, dev server:** see the [README](README.md)
  and [docs/COMMANDS.md](docs/COMMANDS.md).
- **How the codebase is laid out:** [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md)
- **Running tests:** [docs/TESTING.md](docs/TESTING.md)
- **Branching and PRs:** [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
- **Adding a new fantasy provider:** [docs/adding-integrations.md](docs/adding-integrations.md)

## For AI coding agents

Start at [AGENTS.md](AGENTS.md) (universal) or [CLAUDE.md](CLAUDE.md)
(Claude Code specific). Both are intentionally short maps that point to
the docs above.

## Test credentials

For any login step in automated tests: `test@test.com` / `test`.

## `package-lock.json`

CI installs from the lockfile. After **any** change to `package.json`,
run `npm install` and commit the regenerated `package-lock.json` in the
same commit — otherwise CI fails with
`npm ERR! clean install a project with an out-of-sync lockfile`.
