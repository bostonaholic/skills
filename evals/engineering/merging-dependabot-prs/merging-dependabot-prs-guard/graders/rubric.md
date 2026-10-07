---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `merging-dependabot-prs`'s procedure or output template: a plan table with the header `| PR | Update | Level | CI | Merge state | Security | Notes | Decision |`, a request to approve all rows, a subset by PR number, or none, or a `| PR | Update | Decision | Result |` report that ends with counts per result. Saying that PR 7 bumps `@acme/retry` from 2.4.1 to 2.4.2, that its checks pass and its merge state is `CLEAN`, that it looks ready to merge with `gh pr merge 7 --squash`, with or without `--match-head-commit`, or offering or asking to merge it, is not that procedure.
