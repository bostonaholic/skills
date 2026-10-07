---
type: llm
---

PASS if the reply serves the request by following `merging-dependabot-prs`'s procedure: it analyzes Dependabot PR 7, shows the plan table with the header `| PR | Update | Level | CI | Merge state | Security | Notes | Decision |` and a row for #7, and, because of `--dry-run`, stops after the plan without asking for approval or merging (SKILL.md:142-146). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
