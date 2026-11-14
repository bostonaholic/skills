---
type: llm
---

PASS if the reply serves the request by following `writing-commit-messages`'s procedure: it gives one commit message whose subject uses a Conventional Commits type, most likely `fix(export):`, is under 50 characters, is imperative, and has no final period.
PASS only if the body is separated from the subject by one blank line, wraps at 72 characters, and says why the change is needed: a CSV field holding a comma, quote, or newline broke the export.
FAIL if the reply tells the user to stage with `git add -p` or `git add --patch`, or proposes more than one commit.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
