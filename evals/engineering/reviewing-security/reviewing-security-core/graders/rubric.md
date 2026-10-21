---
type: llm
---

PASS if the reply meets every part of this rule. It relays the reviewer's report in full. The report opens with the exact plain line `**Verdict: REQUEST CHANGES**`. The `### Summary`, `### Findings`, and `### Coverage` headings follow in that order. The Summary's first sentence is exactly "1 vulnerability found (1 HIGH, 0 MEDIUM)." Findings holds exactly one entry. Its label reads `**issue (blocking):**` verbatim, followed by the severity HIGH and the input validation category. Its `file:` line cites the `exec` call in `src/routes/export.js` at line 7, or the range 6-7. Its exploit scenario names the `since` query parameter and gives a shell payload, such as `$(...)`, a backtick command, or a `"; <command>; "` break-out of the quoted argument. It has a Fix line that closes the path, such as `execFile` or `spawn` with an argument array, or a strict check of the date before the command runs. Its Confidence is a number from 0.8 to 1.0 (SKILL.md `## Verdict and relay`; references/security-reviewer.md `## What to report`, `## Severity and confidence`, and `## Report format`). FAIL if it breaks any part of that rule.
FAIL if a Findings entry reports the pre-existing `/debug/env` route that returns `process.env` (`src/app.js:6`). The diff shows that route only as an unchanged context line. A finding on the export route may also cite `src/app.js:7`, where the change mounts it.
FAIL if the report uses `reviewing-code`'s template: a verdict line with an emoji token, or a `### Checks` heading.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A `Not judged:` line under `### Coverage`, or one line after the report that says the read-only restriction rests on the reviewer's prompt, does not fail the case.
