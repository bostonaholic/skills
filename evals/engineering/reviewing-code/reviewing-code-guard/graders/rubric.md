---
type: llm
---

PASS if the reply serves the request, also when `reviewing-design-docs` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-code`'s procedure or output template: a verdict line with an emoji token (`**Verdict: ✅ APPROVE**`, `**Verdict: ❌ REQUEST CHANGES**`, or `**Verdict: 💬 COMMENT**`), a `### Checks` heading, a `Test suite: not run` line, or findings that cite the `System Fit` or `Test Value` checklist items. A review of docs/design/coupon-stacking.md that reports its gaps and risks, with or without a plain `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**` line (no emoji), `### Summary` and `### Findings` headings, and Conventional Comments labels, is not that procedure.
