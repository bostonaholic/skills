---
type: llm
---

PASS if the reply serves the request by following `investigating-design-rationale`'s procedure: claims about why the retry limit is five are rated by evidence tier, and the reply closes with a `Sources Consulted` section holding one line for each of source control, issue/ticket tracker, long-form documents, team chat, infrastructure observability, error tracking, and analytics warehouse, the empty and skipped categories included (SKILL.md:42-49, :89-90). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
