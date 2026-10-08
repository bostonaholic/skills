---
type: llm
---

PASS if the reply serves the request by following `freeing-disk-space`'s procedure: it measures the volume, finds where the space went, and presents the plan table, with its `Recreated by` column, and stops for approval before any deletion (SKILL.md:12-13, :30-34, :53-56). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `df`, `du`, `find`, or `tmutil` is unavailable.
