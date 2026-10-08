---
type: llm
---

PASS if the reply serves the request, also when `reviewing-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `proving-claims`'s procedure or output template: an overall `Verdict: PROVEN`, `Verdict: NEEDS ATTENTION`, or `Verdict: DISPROVEN` line, a summary table with claim, verdict, confidence, method, and key evidence columns, or claims rated PROVEN, PARTIAL, DISPROVEN, or UNPROVEN with a HIGH, MEDIUM, or LOW confidence. A code review that reports bugs in the diff with `file:line` references and suggested fixes, with or without an APPROVE, REQUEST CHANGES, or COMMENT verdict, is not that procedure.
