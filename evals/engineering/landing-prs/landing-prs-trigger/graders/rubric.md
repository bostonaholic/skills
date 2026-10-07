---
type: llm
---

PASS if the reply serves the request by following `landing-prs`'s procedure: with CI green and the merge state `BEHIND`, it stops without merging and ends with `Next: /rebasing-branches` (SKILL.md:111, :194-195). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
