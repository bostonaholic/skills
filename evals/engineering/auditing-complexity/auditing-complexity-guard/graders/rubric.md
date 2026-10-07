---
type: llm
---

PASS if the reply serves the request, also when `auditing-tests` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `auditing-complexity`'s procedure or output template: files or functions ranked by cyclomatic complexity with the line of each decision point, a `<module>` pseudo-function, CRAP scores, a lane count with lane analysts measuring complexity, or the `report.json`, `inventory.json`, and `report.md` files under a `docs/plans/<date>-auditing-complexity/` directory. Judging each test's value, or naming which branches of `applyDiscounts` the tests leave uncovered, with their lines, is not that procedure.
