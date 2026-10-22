---
type: llm
---

PASS if the reply serves the request by following `making-code-agent-friendly`'s Audit procedure and Report form (SKILL.md:44-75, :127-167). The reply holds a scorecard with one row for each of the five dimensions, C Contention, B Boundaries, K Contracts, D Discoverability, and V Verification, each rated `Weak`, `Mixed`, `Strong`, or `not measured` with its evidence (SKILL.md:135-141, :162-163). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
The reply holds a finding that names AF1 on the `handlers` array in `src/handlers/index.ts`, cites it as `src/handlers/index.ts:<line>` with a line from 1 to 7, says every new handler edits that file so parallel branches conflict there, and gives the fix as P1: each handler registers itself from its own file, or a loader discovers handler files by directory convention (SKILL.md:145-148). Citing the saved contention output (`src/handlers/index.ts` in 62% of commits) as evidence is part of the procedure. A finding that names AF3 for the numbered `migrations/` files is allowed, not required.
The reply holds a refactor plan whose steps are each one mergeable change that names the files it touches, and it marks steps with disjoint files as parallel-safe when any exist (SKILL.md:150-155, :164-166). FAIL if the plan is one big rewrite with no files named per step.
FAIL if the reply claims it edited files, committed, or opened a PR. FAIL if the reply stops or refuses because the shell, `node`, or `git` is unavailable; the saved command output stands in for them.
