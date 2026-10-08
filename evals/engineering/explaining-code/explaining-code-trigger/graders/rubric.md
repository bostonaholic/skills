---
type: llm
---

PASS if the reply serves the request by following `explaining-code`'s procedure, which has no fixed template (SKILL.md:52): it explains PR 42 at the Brief depth (SKILL.md:27), drawing on the saved PR description and diff rather than guessing, and fits the shape to the subject, so the PR gets before/after framing of what changed and why, led by a one-sentence summary (SKILL.md:38-41, :52-54). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
