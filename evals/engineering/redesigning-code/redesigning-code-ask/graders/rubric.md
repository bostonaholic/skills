---
type: llm
---

PASS if the reply follows the Modes rule of `redesigning-code` for a request that fits neither mode: it names the Redo and Redesign modes, asks which one the user wants, and edits, saves, and resets nothing until the user answers (SKILL.md:18-19). FAIL if the reply edits a file, reports a file as edited, or names a `redo-previous-` branch, a `previous-attempt.patch`, an `untracked.tar`, or a `git restore --source=` reset as done or as its next step.
