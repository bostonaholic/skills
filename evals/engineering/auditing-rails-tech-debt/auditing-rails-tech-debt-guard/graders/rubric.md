---
type: llm
---

PASS if the reply serves the request, also when `simplifying-ruby-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `auditing-rails-tech-debt`'s procedure or report shape: findings graded `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` (for example a `### [HIGH] <title>` heading), each with Where, Smell, Violates (a named principle with its link), Evidence, and Effort fields, ordered by severity and closed by a summary table or a remediation order (SKILL.md:69-90). Saying that `OrderNumberFormatter` is over-engineered and showing it as a simpler model method or helper, with before and after code, is not that procedure.
