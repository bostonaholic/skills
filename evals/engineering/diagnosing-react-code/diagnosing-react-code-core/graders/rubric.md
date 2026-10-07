---
type: llm
---

PASS if the reply meets this rule: where it lists or describes its fixes (or fix plan) one by one, they take the error diagnostics in the order security, correctness, then performance (`no-danger`, then `exhaustive-deps`, then `no-array-index-key`), while a single combined patch and `Fixed:` or `Remaining:` lines in file-line order do not break that order; and it reports in the skill's shape with every line filled: `react-doctor 0.9.17, scope: changed`, a `Score:` line holding the baseline 61, a `Fixed:` line, and a `Remaining:` line giving the severity, rule, `file:line`, and reason for each error not fixed (SKILL.md:46-66). FAIL if it breaks any part of that rule.
Grade the plan for the edits that fix the error diagnostics. A reply that reports the edits as not done passes when it gives that plan. FAIL if the reply claims the edits happened.
FAIL if the reply stops or refuses because the shell, `node`, or `npx` is unavailable, except for the edits that fix the error diagnostics, which are graded as a plan.
