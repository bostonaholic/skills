---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session, and the repository is not on disk. Give the content of each file you would write in the reply instead. The repository is one Node.js service, `ledger`, deployed as a single container, that stores entries in PostgreSQL and posts to the Slack webhook API. Its source files and their imports:
  src/http/routes.js imports src/accounts/accountService.js and src/entries/entryService.js
  src/accounts/accountService.js imports src/accounts/accountRepo.js and src/entries/entryService.js
  src/accounts/accountRepo.js imports src/db/pool.js
  src/entries/entryService.js imports src/entries/entryRepo.js, src/accounts/accountService.js, and src/notify/slack.js
  src/entries/entryRepo.js imports src/db/pool.js
  src/notify/slack.js calls https://hooks.slack.com over HTTPS
  src/db/pool.js connects to PostgreSQL
  Accountants use the service over HTTPS.
---

Visualize the ledger service codebase, and while you're at it tell me which module I should refactor first to break the dependency loops.
