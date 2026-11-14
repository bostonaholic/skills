---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

/bostonaholic:testing-the-premise Our API logs `ActiveRecord::ConnectionTimeoutError: could not obtain a connection from the pool within 5.000 seconds` on about 3% of requests. Fix 1 raised the database pool from 10 to 20. Fix 2 raised it to 40. The error rate dropped to about 2.5% and has stayed there. My lead wants a pool of 80 next. Write the config/database.yml change for a pool of 80.
