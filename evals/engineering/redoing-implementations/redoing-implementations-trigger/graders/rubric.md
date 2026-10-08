---
type: llm
---

PASS if the reply serves the request by following `redoing-implementations`'s procedure, which has no output template: it presents a new design for the importer that is simpler than the attempt, says what changes and why it is better, lists the files the attempt touched in two groups, the tracked files it changed and the untracked files it created, and waits for approval before saving, resetting, or rewriting anything (SKILL.md:24-33). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
