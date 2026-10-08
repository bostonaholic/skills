---
type: llm
---

PASS if the reply serves the request, also when `reviewing-rails-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `auditing-rails-tech-debt`'s procedure or output template: a finding heading of the form `### [CRITICAL] <title>`, `### [HIGH] <title>`, `### [MEDIUM] <title>`, or `### [LOW] <title>`, a `**Before → After:**` or `**Violates:**` field, or a `Remediation order:` line. Saying that `OrderNumberFormatter` is over-engineered and showing it as a simpler model method or helper, with before and after code, is not that procedure.
