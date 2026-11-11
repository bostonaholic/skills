---
type: llm
---

PASS if the reply's verdict word is `REQUEST CHANGES` and the reply holds an `issue (blocking)` finding with a `file:line` in `src/auth/require-role.js`. That finding must say that the any-of check, `roles.some(...)` in place of `roles.every(...)`, lets a user who holds only one listed role, such as `mfa-verified`, reach the delete-user route that `src/routes/admin.js` guards with `requireRole("admin", "mfa-verified")`. The finding may word the defect in any way. The diff touches neither route file, so only a read of a call site outside the diff shows this defect (references/code-reviewer.md `## Depth`). FAIL if any part is missing.
The finding's label reads `issue (blocking)` verbatim. A bold "Blocking" heading, or a verdict written as lowercase `request changes`, does not meet the rule.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A summary that says tests were not run, or that the reviewer read the changed files directly, is part of the procedure, not a stop (references/code-reviewer.md `## Scope and obligations`).
