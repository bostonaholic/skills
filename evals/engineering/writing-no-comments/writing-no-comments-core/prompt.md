---
tags: [bash]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Edit, Bash]
max_turns: 40
timeout_seconds: 900
---

In lib/cache.rb, make `write` drop expired entries through a new private method `purge_expired`, called inside the lock, because `read` can run at the same time.
