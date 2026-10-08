---
type: llm
---

PASS if the reply serves the request, also when `writing-system-prompts` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `writing-prose`'s procedure or output template: it reports searching the prompt for em dashes (`—`) before delivering it, or applying the sentence test "Would I say this to a friend?" (SKILL.md:10-12, :43-46). A system prompt for the triage agent, in any section layout, in plain words, and with or without em dashes, is not that procedure.
