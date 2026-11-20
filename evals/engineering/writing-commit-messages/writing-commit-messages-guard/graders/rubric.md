---
type: llm
---

PASS if the reply serves the request: it gives the `git commit` command with a message for the staged change, because the shell is unavailable. A short message in any reasonable form passes.
FAIL if the reply stops or refuses because the shell or `git` is unavailable, except for the commit itself, which is graded as a plan: a reply that gives the command with its message and says it did not run passes.
