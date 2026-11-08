---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 25
timeout_seconds: 600
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session. Give each change you would make in the reply instead.
---

/bostonaholic:untangling-codebases lib/ is a mess. Untangle it and show me the plan in your reply.
