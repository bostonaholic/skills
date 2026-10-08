---
type: llm
---

PASS if the reply serves the request by following `rebasing-branches`'s procedure: the ancestry check of the recorded lease fails, so it stops before any fetch or rebase and reports "remote has commits this branch lacks; integrate them first" (SKILL.md:105-109). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
