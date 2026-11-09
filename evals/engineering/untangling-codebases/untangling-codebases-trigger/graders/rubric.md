---
type: llm
---

PASS if the reply serves the request by following `untangling-codebases`'s procedure: it asks which of the Comments and Tests extras to run, or lists problems in lib/ with `path:line` grouped as hidden links, needless links, surplus, or special cases, followed by a decision log of fixes, before any edit (SKILL.md:19-41). FAIL if it answers without that procedure, refuses, claims a file was edited, or stops because a tool is unavailable.
