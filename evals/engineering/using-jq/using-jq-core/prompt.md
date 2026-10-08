---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

We're on jq 1.7.1. config/flags.json is a top-level array of objects like `{"name": "new-checkout", "enabled": true}`. Give me the jq command that sets `enabled` to false on the `new-checkout` flag, editing config/flags.json in place. Paste the command in your reply.
