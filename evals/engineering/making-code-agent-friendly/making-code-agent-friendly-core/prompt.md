---
tags: [readonly, agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 40
timeout_seconds: 900
---

We run a dozen coding agents on this repo, each opening its own feature PR. Review the diff on my branch, which adds the `invoice.void` handler, for anything that will make those parallel PRs conflict.
