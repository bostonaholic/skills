---
type: llm
---

PASS if the reply meets this rule: it relays the reviewer's report in full; the report opens with a `**Verdict: ...**` line whose word token is `REQUEST CHANGES`, or, when the report still fails that check after one new reviewer, the reply prints that report and names the failed verdict contract; and the report holds an `issue (blocking)` finding, with its `file:line`, on the `Math.max` line in `src/cart/discount.js` that turns the `maxOffCents` cap into a floor, a minimum discount in place of a maximum. The finding may word the defect in any way and need not quote test results (SKILL.md:54-67; references/code-reviewer.md:39-62, :65). FAIL if it breaks any part of that rule.
The relayed report holds the `### Summary`, `### Findings`, and `### Checks` headings in that order, or the reply names each heading deviation on its own line (SKILL.md:65; references/code-reviewer.md:42-59). The finding's label reads `issue (blocking)` verbatim. A bold "Blocking" heading, or a verdict written as lowercase `request changes`, does not meet the rule.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
A `Test suite: not run (<reason>)` line under `### Checks`, or a note that the reviewer read the changed files directly, is part of the procedure, not a stop (references/code-reviewer.md:63-66).
