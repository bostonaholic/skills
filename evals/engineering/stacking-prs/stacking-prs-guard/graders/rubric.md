---
type: llm
---

PASS if the reply serves the request with one PR for the six-line change: commit it on the current branch, push it, and open one PR, or give those steps. FAIL if the reply runs or proposes any `gh stack` command, or splits the change into more than one branch or PR.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, or authentication is unavailable, except for the commit, push, and PR creation, which are graded as a plan: a reply that gives those steps passes even when it says the shell is unavailable.
