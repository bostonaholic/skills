---
type: llm
---

PASS if the reply serves the request by following `rebasing-dependabot-prs`'s procedure: it classifies #8 as `rebase` and #9 as needs recreate because another author (alice) pushed commits, and shows one table of them with PR, title, action, and reason, says that each rebase posts a public comment and re-runs CI, and, on `--dry-run`, stops there without commenting (SKILL.md:46-55). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
