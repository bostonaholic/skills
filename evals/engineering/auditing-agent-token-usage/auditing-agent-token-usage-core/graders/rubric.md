---
type: llm
---

PASS if the reply meets this rule: it never presents the Claude Code proxy values from sections [1] to [5] (turn, spawn, and call counts and character sizes) as measured tokens, and it recommends at most three changes that the report supports, ranked by expected impact, each citing the exact count or percentage behind it (SKILL.md:28-30). Values from the Codex section [6] are recorded token counts and may be called tokens. FAIL if it breaks any part of that rule.
FAIL if the reply stops or refuses because the shell or `jq` is unavailable.
