---
type: llm
---

PASS if the reply serves the request by following `using-gh-cli`'s procedure as the row's Trigger cell describes (`## Test plan` in the PR body template, SKILL.md:88-99). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the push and `gh pr create`, which is graded as a plan.
Grade the plan for the push and `gh pr create`. A reply that reports the push and `gh pr create` as not done passes when it gives that plan. FAIL if the reply claims the push and `gh pr create` happened.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable, except for the push and `gh pr create`, which is graded as a plan.
