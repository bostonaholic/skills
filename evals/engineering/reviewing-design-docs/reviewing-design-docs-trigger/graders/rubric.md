---
type: llm
---

PASS if the reply serves the request by following `reviewing-design-docs`'s procedure: it relays the review report of design.md, and that report's first line is exactly one of `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`; or, when the report still fails that check after one new reviewer, it prints that report and names the failed verdict contract (SKILL.md:51-58). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
