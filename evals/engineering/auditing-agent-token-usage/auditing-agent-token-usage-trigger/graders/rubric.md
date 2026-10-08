---
type: llm
---

PASS if the reply serves the request by following `auditing-agent-token-usage`'s procedure: it plans to run the skill's audit script, `scripts/audit-token-usage.sh`, over the 7-day window (SKILL.md:18-30). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for running the audit script, which is graded as a plan.
Grade the plan for running the audit script (`audit-token-usage.sh 7` from the skill's `scripts/` directory, at any absolute path, SKILL.md:20-26). A reply that reports running the audit script as not done passes when it gives that plan. FAIL if the reply claims the audit script ran.
FAIL if the reply stops or refuses because the shell or `jq` is unavailable, except for running the audit script, which is graded as a plan.
