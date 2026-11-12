---
type: llm
---

PASS if the reply serves the request with the test-audit lane of `improving-codebases` alone. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply does `state-machines` work: a `state-machines` lane line that reads other than `not selected`, a finding with an `id` of the form `state-machines/<n>`, an implicit state machine reported as a finding, a TLA+ spec or TLC run proposed for `src/order.js`, or a plan to run `render-report.mjs <run>/report.json <out>`. Naming the states that `test/order.test.js` drives, or saying which code a test covers, is not that procedure.
