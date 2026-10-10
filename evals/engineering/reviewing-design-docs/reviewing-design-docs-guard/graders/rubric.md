---
type: llm
---

PASS if the reply reviews change.diff for bugs or merge safety, in any form. A `reviewing-code` report passes: a `**Verdict: ...**` line whose word is APPROVE, REQUEST CHANGES, or COMMENT (an emoji may precede the word), then `### Summary`, `### Findings` with Conventional Comments labels such as `issue (blocking):`, and `### Checks`. A reply that says this session cannot run the review also passes. FAIL only if the reply applies `reviewing-design-docs`'s procedure: a summary that ends with the count line `issue: <n>, suggestion: <n>, nitpick: <n>`, a check of change.diff against the design-template headings Current state, Desired end state, Patterns to follow, and Open questions (deferred) as a set, or a decision audit that labels its checks named alternative, stated trade-off, and reconstructable reason.
