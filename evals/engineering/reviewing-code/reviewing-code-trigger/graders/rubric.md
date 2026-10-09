---
type: llm
---

PASS if the reply serves the request by following `reviewing-code`'s procedure, whose `**Verdict: ` line is also in reviewing-design-docs (reviewing-design-docs/SKILL.md:32-33): it relays in full the reviewer's report on the branch's change, which opens with a `**Verdict: ...**` line whose word token is `APPROVE`, `REQUEST CHANGES`, or `COMMENT`, followed by the `### Summary`, `### Findings`, and `### Checks` headings in that order; or, when the report still fails the verdict check after one new reviewer, it prints that report and names the failed verdict contract; or it relays a report whose headings deviate as it arrived and names the deviation on its own line (SKILL.md:37-47; references/code-reviewer.md:27-54). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A `Test suite: not run (<reason>)` line under `### Checks`, or a note that the reviewer read the changed files directly, is part of the procedure, not a stop (references/code-reviewer.md:63-66).
