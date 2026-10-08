---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

In Python, parse this JSON and give me a function that returns the numbers of the PRs that are not drafts. Paste the function in your reply.

```json
[
  {"isDraft": false, "number": 41, "title": "Retry webhook deliveries to acme/billing"},
  {"isDraft": true, "number": 42, "title": "WIP: per-route cache TTL"},
  {"isDraft": false, "number": 43, "title": "Bump acme-sdk to 3.2.0"}
]
```
