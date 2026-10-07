---
type: llm
---

PASS if the reply serves the request by following `improving-prompts`'s procedure: it numbers the prompt's instructions, constraints, and examples as an intent inventory (I1, I2, ...) inside a `<decompose>` step, then works through the `<group>`, `<elevate>`, `<synthesize>`, and `<validate>` steps, and ends with the improved prompt in a `text` block followed by a list that maps the inventory items to it (SKILL.md:19-33, :40-50). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
