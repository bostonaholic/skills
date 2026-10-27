---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 40
timeout_seconds: 900
append_system_prompt: |
  Earlier in this conversation, the user said the storefront must never show a stock count more than two minutes older than the warehouse count.
---

Write a design doc for replacing the nightly inventory sync between our warehouse system and the storefront with an event-driven sync. The team is leaning toward a Postgres outbox table drained by a worker. Paste the full doc in your reply.
