---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give the content of each file you would write in the reply instead.
---

Prototype a token bucket rate limiter in Python for our API so I can see whether the algorithm fits. Just the core logic, no web framework.
