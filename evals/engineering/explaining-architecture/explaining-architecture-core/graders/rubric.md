---
type: llm
---

PASS if the reply meets this rule: every claim it makes about the code carries a `file:line` citation into this repository, such as `src/webhooks/worker.js:18` (SKILL.md:32-33). Entries in a `Where Things Live` file or directory map need no line number. A summary sentence or table that restates steps cited elsewhere in the reply needs no citation of its own, and an absence claim (nothing calls `runOnce`) passes when it names what was searched. FAIL if it breaks any part of that rule.
