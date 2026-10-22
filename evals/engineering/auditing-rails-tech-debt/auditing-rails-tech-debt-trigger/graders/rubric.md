---
type: llm
---

PASS if the reply serves the request by following `auditing-rails-tech-debt`'s procedure: each finding carries a severity, cites `file:line` for code it read, links a named source for the violated principle, and shows before and after code (SKILL.md:11-19, :55-75). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
