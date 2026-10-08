---
type: llm
---

PASS if the reply serves the request by following `rebasing-open-prs`'s procedure: it shows the plan from `list-prs.sh`, the rebaseable PRs #41 and #43 with number, branch, base, title, and author (#43 on its own base, `feature/rate-limit`), and #48 skipped as a Dependabot PR with its reason, states that each listed PR will be rebased and force-pushed, and waits for a go-ahead before any push (SKILL.md:9-11, :15, :39-48). The per-PR report of branch, status, conflicts, verify result, worktree, and note (:103-106) comes only after dispatch, so the reply need not hold it. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
