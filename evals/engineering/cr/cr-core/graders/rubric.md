---
type: llm
---

PASS if the reply meets this rule: `cr` passes the text typed after it, `origin/main...HEAD`, unchanged to `reviewing-code` as the diff target, and adds nothing after `reviewing-code`'s output (SKILL.md:9-11). The reply shows `reviewing-code`'s output for that range: a `**Verdict: ...**` line whose word is `APPROVE`, `REQUEST CHANGES`, or `COMMENT`, a short summary, and the `### Findings` section. FAIL if it breaks any part of that rule.
FAIL if the reply adds its own review, findings, or advice after `reviewing-code`'s output, reviews a different target, or asks the user to restate the target.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A summary that says tests were not run, or that the reviewer read the changed files directly, is part of the procedure, not a stop.
