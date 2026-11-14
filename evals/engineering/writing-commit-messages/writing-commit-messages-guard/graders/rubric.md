---
type: llm
---

PASS if the reply serves the request: it gives the `git commit` command with a message for the staged change, because the shell is unavailable. A short message in any reasonable form passes.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
