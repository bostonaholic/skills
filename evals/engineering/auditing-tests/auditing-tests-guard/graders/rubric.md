---
type: llm
---

PASS if the reply serves the request, also when `auditing-complexity` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `auditing-tests`'s procedure or output template: single-letter **R**, **F**, **C**, or **D** marks on test declarations, a per-test removal-evidence record keyed by `caughtBug`, `remainingProof`, `freedCode`, or `riskAndCommand`, lane auditors dispatched over the test files, or a `baseline.status` of `ran` or `not-run`. Ranking the functions in `src/` by complexity or change risk, naming their callers, noting which tests in `test/` cover them, or saying a test duplicates another or could be merged or removed, is not that procedure.
