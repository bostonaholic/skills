---
type: llm
---

PASS if the reply serves the request, also when `writing-system-prompts` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `improving-prompts`'s procedure or output template: an intent inventory numbered I1, I2, ..., or a closing list that maps inventory items to the improved prompt, such as `Merged:`, `Kept as written:`, or `Flagged:` lines (SKILL.md:16-43). A new system prompt written from the stated requirements, in any section layout and with or without a note on its assumptions, is not that procedure.
