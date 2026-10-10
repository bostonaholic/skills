---
type: llm
---

PASS if the reply serves the request by following `summarizing-shipped-work`'s procedure: a shipped-work report for 2026-09-01 to 2026-09-30, grouped by product or system, with the CI and refactor PRs under an `Engineering health` sub-header (SKILL.md:22-24, :48-55, :97). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
