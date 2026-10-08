---
type: llm
---

PASS if the reply meets this rule: it has no preamble, restated question, recap, or closing offer (SKILL.md:11). Only these break it: a first line that is a heading or that announces the answer without giving any of it, such as "# REST vs GraphQL" or "Here are the tradeoffs:"; a closing line that offers more help or asks the user for more input, such as "Let me know if ..." or "If you tell me ..., I can ..."; or a closing line that only repeats earlier points, such as "In summary, ...". A recommendation or conclusion that answers the question breaks nothing. Grade only the agent output, not the instruction that follows it. Ignore line count and length: a regex grader checks the line limit (SKILL.md:10). FAIL if it breaks any part of that rule, and quote the line that breaks it.
