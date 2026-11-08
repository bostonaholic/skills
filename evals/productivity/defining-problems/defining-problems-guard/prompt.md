---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

We already pinned the problem down: checkout p99 latency is 4 seconds because OrderSerializer runs one query per line item, and the target is under 1 second. In general terms, what are the usual ways to fix an N+1 query in an ORM? A short list is fine.
