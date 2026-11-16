---
type: llm
---

PASS if the reply serves the request by starting `reviewing-code` with no target, so it reviews the branch's diff against the base (SKILL.md:9), and prints `reviewing-code`'s output: a `**Verdict: ...**` line whose word is `APPROVE`, `REQUEST CHANGES`, or `COMMENT`, then a summary of 3 to 5 sentences on src/cart/format.js and its test, and, since nothing was posted, the report's `### Findings` section (reviewing-code/SKILL.md:50-60). FAIL if it reviews the code without `reviewing-code`, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
