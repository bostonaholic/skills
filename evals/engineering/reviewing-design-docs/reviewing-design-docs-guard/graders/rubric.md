---
type: llm
---

PASS if the reply serves the request, also when `reviewing-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-design-docs`'s procedure or output template: a summary that ends with the count line `issue: <n>, suggestion: <n>, nitpick: <n>`, a check of change.diff against the design-template headings Current state, Desired end state, Patterns to follow, and Open questions (deferred) as a set, or a decision audit that labels its checks named alternative, stated trade-off, and reconstructable reason. Reviewing change.diff for bugs, including Conventional Comments findings, a `**Verdict:` line of APPROVE, REQUEST CHANGES, or COMMENT, and notes on the change's edge cases, risks, or blast radius, is not that procedure.
