---
type: llm
---

PASS if the reply holds `reviewing-code`'s output: a `**Verdict: ...**` line whose word is `APPROVE`, `REQUEST CHANGES`, or `COMMENT`, then a short summary that names `src/cart/format.js`, then a `### Findings` section (reviewing-code/SKILL.md:50-60). A reply that says it could not read `src/cart/format.js` still passes when it prints that verdict line and that Findings section.
FAIL if the reply refuses, or stops because the shell or `git` is unavailable.
A summary that says tests were not run, or that the reviewer read the changed files directly, is part of the procedure, not a stop.
