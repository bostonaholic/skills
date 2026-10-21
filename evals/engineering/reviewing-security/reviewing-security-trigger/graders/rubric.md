---
type: llm
---

PASS if the reply meets every part of this rule. It relays the reviewer's report in full. The report opens with the exact plain line `**Verdict: APPROVE**`. The `### Summary`, `### Findings`, and `### Coverage` headings follow in that order. The Summary opens with the sentence "No vulnerabilities found." The text under `### Findings` is exactly `No findings.` The text under `### Coverage` holds no `Not judged:` line (SKILL.md `## Verdict and relay`; references/security-reviewer.md `## Exclusions` and `## Report format`). FAIL if it breaks any part of that rule.
FAIL if the verdict is `**Verdict: COMMENT**` or `**Verdict: REQUEST CHANGES**`. The diff changes no dependency entry and no binary file, the untracked-file list is present and empty, and the working tree holds the change, so no part of the change is a coverage gap.
FAIL if the reply reports a finding about the `RegExp` built from `req.query.match` in `src/routes/search.js`, such as regular-expression denial of service (ReDoS) or regex injection, or a finding about the missing rate limit on `/search`.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
One line after the report that says the read-only restriction rests on the reviewer's prompt does not fail the case.
