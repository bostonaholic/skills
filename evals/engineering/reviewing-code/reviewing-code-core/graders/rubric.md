---
type: llm
---

PASS if the reply meets this rule: it opens with a `**Verdict: ...**` line whose word token is `REQUEST CHANGES`, followed by a summary of 3 to 5 sentences that says why nothing was posted (the branch has no pull request, or the session could not check for one), then the report's `### Findings` section; or, when the report still fails the verdict check after one new reviewer, the reply prints that report and names the failed verdict contract. The findings hold an `issue (blocking)` finding, with its `file:line`, on the `Math.max` line in `src/cart/discount.js` that turns the `maxOffCents` cap into a floor, a minimum discount in place of a maximum. The finding may word the defect in any way and need not quote test results (SKILL.md:33-59; references/code-reviewer.md:28-51, :54). FAIL if it breaks any part of that rule.
The finding's label reads `issue (blocking)` verbatim. A bold "Blocking" heading, or a verdict written as lowercase `request changes`, does not meet the rule. FAIL if the reply relays the reviewer's `### Summary` or `### Checks` sections beyond the short summary (SKILL.md:50).
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A summary that says tests were not run, or that the reviewer read the changed files directly, is part of the procedure, not a stop (references/code-reviewer.md:64-67).
