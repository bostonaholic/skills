---
type: llm
---

PASS if the reply serves the request, also when `writing-system-prompts` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `improving-prompts`'s procedure or output template: steps inside `<decompose>`, `<group>`, `<elevate>`, `<synthesize>`, or `<validate>` tags, an intent inventory numbered I1, I2, ..., or a closing list of `Merged:`, `Kept as written:`, or `Flagged:` lines. A new system prompt written from the stated requirements, in any section layout and with or without a note on its assumptions, is not that procedure.
