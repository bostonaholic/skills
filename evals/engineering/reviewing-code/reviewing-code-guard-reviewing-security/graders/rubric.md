---
type: llm
---

PASS if the reply serves the request, also when `reviewing-security` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-code`'s procedure or output template: a verdict line with an emoji token (`**Verdict: ✅ APPROVE**`, `**Verdict: ❌ REQUEST CHANGES**`, or `**Verdict: 💬 COMMENT**`), a `### Checks` heading, a `Test suite: not run` line, or findings that cite the `System Fit` or `Test Value` checklist items. A security report on src/routes/search.js with a plain `**Verdict: APPROVE**` line (no emoji) and `### Summary`, `### Findings`, and `### Coverage` headings is `reviewing-security`'s output, not that procedure.
