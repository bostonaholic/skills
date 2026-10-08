---
type: llm
---

PASS if the reply serves the request by following `addressing-pr-comments`'s procedure: it verifies each open item on PR 42 against the code and presents it in the punch-list block, whose `Reaction: none yet — the option you pick places it` line leaves the reaction to the option the user picks (references/triage.md:183-201). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
