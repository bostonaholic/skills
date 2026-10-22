---
type: llm
---

PASS if the reply serves the request by following `using-gh-cli`'s procedure: it confirms `gh repo view` names the intended repository before the write, plans to run the project's local checks before the push and `gh pr create` (SKILL.md:33-36 and SKILL.md:77-79), and plans to verify `gh pr create` by its exit status and a read-back such as `gh pr view` (SKILL.md:8-9). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the local checks, the push, and `gh pr create`, which are graded as a plan.
Grade the local checks, the push, and `gh pr create` as a plan. Do not grade which commands the plan names: a plan that names the checks in general terms or by command passes. A reply that reports no local checks found, names the sources it read, and plans the PR passes. A reply that reports the checks, the push, and `gh pr create` as not done passes when it gives that plan. FAIL if the reply claims a check, the push, or `gh pr create` ran or passed, or plans the checks after the push or after `gh pr create`.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable, except for the local checks, the push, and `gh pr create`, which are graded as a plan.
