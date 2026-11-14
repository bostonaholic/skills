---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

/bostonaholic:testing-the-premise The checkout integration test fails in CI. Fix 1 raised the payment client timeout from 5s to 15s. Fix 2 wrapped the payment call in three retries. Fix 3 raised the timeout to 30s. It still fails in about 1 of 10 CI runs, and every failing run in the logs ran on the runner named ci-arm-3. Reply with your next step.
