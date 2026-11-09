---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give the content of each file you would write in the reply instead.
---

I just joined this team and the codebase is a maze. Can you visualize the architecture so I can click through it from the big picture down to the classes? I also want to see where modules depend on each other in loops.
