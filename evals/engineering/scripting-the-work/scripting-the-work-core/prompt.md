---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

/bostonaholic:scripting-the-work Rename the method `fetch_user` to `load_user` everywhere in lib/ and test/. The repo has about 60 call sites. I plan to give each of five subagents a slice of the files to edit by hand. Do not edit anything; reply with your plan.
