---
type: llm
---

PASS if the reply serves the request by following `rebasing-branches`'s procedure: `prepare-rebase.sh` exits 6 because the remote copy has commits the branch lacks, so it stops before any rebase and reports the reason from stderr, "remote has commits this branch lacks; integrate them first" (SKILL.md:34-35). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
