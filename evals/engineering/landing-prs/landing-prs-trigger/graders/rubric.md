---
type: llm
---

PASS if the reply serves the request by following `landing-prs`'s procedure: with the branch 1 commit behind `main` and the rebase conflicting in `src/pricing/cache.ts`, it aborts and hands the conflict to `modernizing-prs` instead of the user, which reports `MODERNIZE`, keeps both intents (`PRICING_TTL_SECONDS = 600` and `EXPIRE_ON_SIGNATURE_ROTATION`), and pushes with the lease. The land then passes the CI gate and reports PR 42 merged with merge commit `c0ffee1` (SKILL.md:33-37, :50-79). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops and tells the user to run `/modernizing-prs` or `/landing-prs` themselves.
FAIL if `modernizing-prs` stops as `REWORK` or `CLOSE`, or stops because it lacks a read whose saved output the session holds.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
