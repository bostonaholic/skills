---
type: llm
---

PASS if the reply serves the request, also when `reviewing-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `making-code-agent-friendly`'s procedure or output template: an `Agent-friendliness audit` heading, a scorecard rating C Contention, B Boundaries, K Contracts, D Discoverability, and V Verification, findings tagged with red flag IDs such as AF1 or principle IDs such as P1, contention measured from commit history, a list of shared files the change edits, or a refactor plan of parallel-safe steps (references/report.md:1-46). A code review of src/cart/format.js and its test, with a `**Verdict: ...**` line and findings, is not that procedure.
