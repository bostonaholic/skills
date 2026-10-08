---
type: llm
---

PASS if the reply serves the request, also when `writing-system-prompts` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `composing-agent-prompts`'s procedure or output template: a prompt under the `## Title and one-line goal`, `## Repo and scope`, `## Ground truth`, `## Required changes`, or `## Acceptance criteria` headings. A system prompt for the bot that sets its role, rules, tool use, length limit, hand-off, and examples, in any section layout, is not that procedure.
