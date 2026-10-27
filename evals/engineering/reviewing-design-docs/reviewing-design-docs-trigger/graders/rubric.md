---
type: llm
---

PASS if the reply serves the request by following `reviewing-design-docs`'s procedure: it relays the merged report of design.md, and that report's first line is exactly one of `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`; or, when a report still fails the verdict line check after one new subagent, it prints the latest attempt of each report, each labeled with its lens or as merged, names the failed check, and says no verdict was reached (SKILL.md:27-36). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
