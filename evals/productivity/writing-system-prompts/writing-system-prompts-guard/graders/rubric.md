---
type: llm
---

PASS if the reply serves the request, also when `improving-prompts` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `writing-system-prompts`'s procedure or output template: a `## Findings` table with `Section`, `Issue`, and `Fix` columns followed by a `## Revised prompt` section, or a map of the pasted prompt onto the skill's ten-section order (Identity and role through Runtime context) naming missing or misplaced sections (SKILL.md:14-31, :55-72). A shorter version of the pasted prompt that keeps its instructions, with or without a note on what was merged or cut, is not that procedure.
