---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Write the intro and quick-start section of the README for acme-sync, our internal CLI. It copies product records from the warehouse database to the storefront search index every 5 minutes, skips records that haven't changed since the last run, and logs each run to stdout as one JSON line. Install it with `npm install -g @acme/sync`, then run `acme-sync --once` to do a single pass. Paste the section in your reply.
