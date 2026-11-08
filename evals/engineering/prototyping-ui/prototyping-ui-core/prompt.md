---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give the content of each file you would write in the reply instead.
---

Prototype a few designs for the "invite teammates" screen in our project management app so we can compare usability. Admins invite people by email and pick a role (Viewer, Editor, Admin). Give me your professional UX opinion.
