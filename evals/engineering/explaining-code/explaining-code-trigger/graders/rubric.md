---
type: llm
---

PASS if the reply serves the request by following `explaining-code`'s procedure, which has no fixed template (SKILL.md:66): it explains PR 42 from its description and its diff (SKILL.md:40-42), and fits the shape to the subject, so the PR gets before/after framing of what changed and why, led by a one-sentence summary (SKILL.md:52-58, :66-67). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
