---
type: llm
---

PASS if the reply meets this rule: it relays the reviewer's report of design.md, whose first line is exactly one of `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`, or, when the report still fails that check after one new reviewer, it prints that report and names the failed verdict contract; it never writes or repairs a verdict line itself; and it gives no revised copy of design.md or of any of its sections, leaving the revision to the user (SKILL.md:51-62). FAIL if it breaks any part of that rule.
