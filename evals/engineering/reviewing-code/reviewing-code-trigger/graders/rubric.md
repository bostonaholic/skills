---
type: llm
---

PASS if the reply serves the request by following `reviewing-code`'s procedure, whose `**Verdict: ` line is also in reviewing-design-docs (reviewing-design-docs/SKILL.md:28): it opens with a `**Verdict: ...**` line whose word token is `APPROVE`, `REQUEST CHANGES`, or `COMMENT`, followed by a summary of 3 to 5 sentences on the branch's change that says why nothing was posted, then the report's `### Findings` section; or, when the report still fails the verdict check after one new reviewer, it prints that report and names the failed verdict contract (SKILL.md:33-59; references/code-reviewer.md:28-55). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A summary that says tests were not run, or that the reviewer read the changed files directly, is part of the procedure, not a stop (references/code-reviewer.md:64-67).
