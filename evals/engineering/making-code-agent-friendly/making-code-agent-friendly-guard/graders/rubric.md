---
type: llm
---

PASS if the reply serves the request, also when `auditing-complexity` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `making-code-agent-friendly`'s procedure or output template: an `Agent-friendliness audit` heading, a scorecard rating C Contention, B Boundaries, K Contracts, D Discoverability, and V Verification, findings tagged with red flag IDs such as AF1 or principle IDs such as P1, contention measured from commit history, or a refactor plan of parallel-safe steps (SKILL.md:131-171). Ranking the functions in `src/handlers/` by complexity, with or without their lines, is not that procedure.
