---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give the content of each file you would write in the reply instead.
---

Explain how a request flows through our checkout endpoint, from the HTTP handler to the database write. A short written walkthrough is fine, no diagrams.
