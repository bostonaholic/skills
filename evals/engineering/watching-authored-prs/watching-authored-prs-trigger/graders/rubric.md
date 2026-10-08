---
type: llm
---

PASS if the reply serves the request by following `watching-authored-prs`'s procedure: PR 42 is already approved at arm, so it reports the approval, prints the head SHA with its CI state, and ends with `Next: run /landing-prs when you want to land it.` (references/arm.md:57-60, references/stop-conditions.md:21-32). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
