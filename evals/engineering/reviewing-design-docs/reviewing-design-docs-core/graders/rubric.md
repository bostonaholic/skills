---
type: llm
---

PASS if the reply meets this rule: it relays the merged report of design.md, whose first line is exactly one of `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`, or, when a report still fails the verdict line check after one new subagent, it prints the latest attempt of each report, each labeled with its lens or as merged, names the failed check, and says no verdict was reached; it never writes or repairs a verdict line itself; and it gives no revised copy of design.md or of any of its sections, leaving the revision to the user (SKILL.md:27-36). FAIL if it breaks any part of that rule.
