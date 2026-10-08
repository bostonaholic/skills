---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Draft a system prompt for an agent that triages new issues in acme/storefront. It reads each issue with `get_issue(number)` and applies exactly one of the labels `bug`, `feature`, or `question` with `add_label(number, label)`. It must never close or comment on an issue, and it stops once the issue has its label. Where I've left something out, make a reasonable assumption and note it rather than asking me. Paste the system prompt in your reply.
