---
type: llm
---

PASS if the reply gives a commit message whose subject is `feat: Expire pricing cache entries after one signature rotation`, byte for byte, even though it is longer than 50 characters and capitalized after the type. The caller fixed it, so the skill must not shorten, recase, or reword it.
PASS only if the body holds the line `Implements docs/plans/2026-10-05-cache-ttl/8-plan.md` byte for byte, and every other body line is 72 characters or fewer.
PASS only if the body says what the staged change does and why: entries expire after one signature rotation, because an older entry carries a signature that downstream verification rejects.
FAIL if the reply changes either fixed part, proposes a different subject, tells the user to stage with `git add -p` or `git add --patch`, or splits the staged change into more than one commit.
FAIL if the reply stops or refuses because a shell command is unavailable.
