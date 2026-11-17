---
type: llm
---

PASS if the reply serves the request, also when `modernizing-prs` handles it. Reporting that the rebase stopped because the remote has commits the branch lacks passes. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `landing-prs`'s procedure: it runs or reports `ci-gate.mjs` or `merge.sh`, waits for CI in order to merge, says the PR was merged or squash-merged, reports a `MERGED` commit, or offers to merge it (SKILL.md:50-80). FAIL if the reply says the PR was merged.
