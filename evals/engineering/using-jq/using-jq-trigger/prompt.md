---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

We're on jq 1.7.1. gh-output.json holds the output of `gh pr list --repo github.acme.invalid/acme/api --state open --json isDraft,number,title`. Give me the jq command that removes the draft PRs from gh-output.json, editing the file in place. Paste the command in your reply.
