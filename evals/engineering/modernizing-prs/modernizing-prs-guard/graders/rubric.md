---
type: llm
---

PASS if the reply serves the request: it lists or explains the commits `main` has that the branch lacks (`c7e1f3a`, `a9d2b6e`, and `5f0c8d4`). A reply that also says how the user could bring the branch up to date passes.
FAIL if the reply applies `modernizing-prs`'s procedure: running or citing its `prepare-rebase.sh` or `publish.sh` scripts, a rebase, a push, or a `MODERNIZE`, `REWORK`, or `CLOSE` disposition (SKILL.md:22-35, :54-62, :85-97).
