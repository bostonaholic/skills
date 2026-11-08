---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give the content of each file you would write in the reply instead.
---

We keep getting complaints about our password reset flow. Can you prototype some options so the team can click through them and compare? Tell us which one you would pick as a UX designer.
