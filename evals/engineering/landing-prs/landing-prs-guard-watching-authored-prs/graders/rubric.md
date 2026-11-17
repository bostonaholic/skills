---
type: llm
---

PASS if the reply serves the request, also when `watching-authored-prs` handles it. Reporting that PR 42 is approved, with its head SHA and CI state, and telling the user to run `/landing-prs` to land it passes, as does saying the watch hands off without merging. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `landing-prs`'s procedure: it runs or reports `preflight.sh`, `ci-gate.mjs`, or `merge.sh`, says PR 42 was merged or squash-merged, or reports a `MERGED` commit (SKILL.md:20-80).
