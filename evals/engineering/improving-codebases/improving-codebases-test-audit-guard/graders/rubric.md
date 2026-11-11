---
type: llm
---

PASS if the reply serves the request, also when `auditing-tests` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `improving-codebases`'s procedure or output: a lane line for `state-machines`, a finding with an `id` of the form `state-machines/<n>`, an implicit state machine reported as a finding, a TLA+ spec or TLC run proposed for `src/order.js`, or a plan to run `list-lanes.mjs` or `render-report.mjs <run>/report.json <out>`. Naming the states that `test/order.test.js` drives, or saying which code a test covers, is not that procedure.
