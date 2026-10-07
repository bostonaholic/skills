---
type: llm
---

PASS if the reply serves the request by following `merging-dependabot-prs`'s procedure: it analyzes Dependabot PR 7, shows the plan table with the header `| PR | Update | Level | CI | Merge state | Security | Notes | Decision |` and a row for #7, and, because of `--dry-run`, stops after the plan without asking for approval or merging (SKILL.md:37, :153-156). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
Analyzing PR 7 in this session from the saved command output instead of in step 3 subagents, or saying the shell is unavailable while still showing the plan, is not a stop and not answering without the procedure (shared/step-delegation.md:14-15).
