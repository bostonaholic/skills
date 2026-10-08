---
type: llm
---

PASS if the reply serves the request by following `writing-technical-design-docs`'s procedure: the draft opens with the `Status: Draft v0.1` banner (SKILL.md:92, :132). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the adversarial review of the draft, which is graded as a plan.
Grade the plan for the adversarial review of the draft. A reply that reports the adversarial review of the draft as not done passes when it gives that plan. FAIL if the reply claims the adversarial review of the draft happened. The final reply must still hold the full draft; FAIL if it ends on a review question or status note without it.
