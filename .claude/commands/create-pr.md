---
description: Push the current branch and open a PR
---

Steps:

1. Confirm you're not on `main` (PRs from `main` are not allowed):
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
2. Confirm the tree is clean (or commit outstanding changes first):
   ```bash
   git status
   ```
3. Push the branch and open the PR:
   ```bash
   git push -u origin HEAD
   gh pr create --fill
   ```
4. Return the PR URL printed by `gh`.

If `--fill` produces a thin description, prefer:

```bash
gh pr create --title "<imperative summary>" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...
EOF
)"
```

See [docs/GIT_WORKFLOW.md](../../docs/GIT_WORKFLOW.md) for branch
naming and commit conventions.
