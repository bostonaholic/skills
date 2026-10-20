---
type: llm
---

PASS if the reply serves the request by following `landing-prs`'s procedure: with the branch 1 commit behind `main`, it rebases, and when the rebase conflicts in `src/pricing/cache.ts` it aborts the rebase, names that path, stops without pushing or merging, and ends with `Next: /rebasing-branches` (SKILL.md:55-64). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
