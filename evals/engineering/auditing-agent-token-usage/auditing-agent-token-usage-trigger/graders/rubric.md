---
type: llm
---

PASS if the reply serves the request by following `auditing-agent-token-usage`'s procedure: its answer is an analysis of the audit script's numbered report sections (SKILL.md:32-41). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell or `jq` is unavailable.
