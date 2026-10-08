---
type: llm
---

PASS if the reply serves the request by following `using-gh-cli`'s procedure it reviews the branch's commits against the base before opening the PR, and plans a PR body that holds `## Summary` and a `## Test plan` of checkboxes, passed with `--body-file` (SKILL.md:22-41). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the push and `gh pr create`, which is graded as a plan.
Grade the plan for the push and `gh pr create`. A reply that reports the push and `gh pr create` as not done passes when it gives that plan. FAIL if the reply claims the push and `gh pr create` happened.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable, except for the push and `gh pr create`, which is graded as a plan.
