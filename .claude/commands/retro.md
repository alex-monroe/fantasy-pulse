---
description: Retrospective — find friction and propose doc/skill updates
---

Review the current conversation and surface places the harness could be
better. The goal is a tighter loop next time, not a postmortem.

## Look for

- **Agent errors or backtracking** — wrong assumptions, dead ends,
  re-reading the same file repeatedly.
- **User corrections** — anything the human had to point out that the
  docs or skills should have prevented.
- **Missing documentation** — facts you discovered the hard way that
  aren't in `AGENTS.md`, `CLAUDE.md`, or `docs/`.
- **Missing skills** — repetitive command sequences that should be a
  one-liner under `.claude/commands/`.
- **Approval gates that could be automated** — repeated permission
  prompts where adding an allow rule to `.claude/settings.local.json`
  would be safe.
- **Stale rules** — guidance in the docs that no longer matches reality.

## Output

1. Present a table:

   | Finding | Proposed fix | Where it lands |
   | --- | --- | --- |

2. Wait for the user to approve / reject each row.
3. Implement approved changes.
4. Open a single PR titled `chore: retro updates from <date>` with the
   doc/skill changes. Follow [docs/GIT_WORKFLOW.md](../../docs/GIT_WORKFLOW.md).

If nothing surfaced, say so plainly — don't manufacture findings.
