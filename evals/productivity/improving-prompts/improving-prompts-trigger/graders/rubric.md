---
type: llm
---

PASS if the reply serves the request by following `improving-prompts`'s procedure: it numbers the prompt's instructions, constraints, and examples as an intent inventory (I1, I2, ...), groups them into higher-level rules, maps every item to the draft so none is dropped silently, and ends with the improved prompt in a `text` block followed by a list that maps the inventory items to it, merged, kept as written, or flagged (SKILL.md:16-29, :31-43). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
