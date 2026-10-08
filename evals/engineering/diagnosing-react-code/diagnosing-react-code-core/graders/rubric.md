---
type: llm
---

PASS if the reply meets this rule: where it explains its fixes (or fix plan) error by error, it takes the error diagnostics in the order security, correctness, then performance (`no-danger`, then `exhaustive-deps`, then `no-array-index-key`); the order inside a single combined code patch and inside the `Fixed:` and `Remaining:` lines is not graded, and either order passes there; and it reports in the skill's shape with every line filled: `react-doctor 0.9.17, scope: changed`, a `Score:` line holding the baseline 61, a `Fixed:` line, and a `Remaining:` line giving the severity, rule, `file:line`, and reason for each error the reply neither fixes nor plans a fix for. A planned fix the reply does not apply may go on the `Fixed:` line marked as not applied, or on the `Remaining:` line with that as its reason (SKILL.md:56-58, :64-73). FAIL if it breaks any part of that rule.
Grade the plan for the edits that fix the error diagnostics. A reply that reports the edits as not done passes when it gives that plan. FAIL if the reply claims the edits happened.
FAIL if the reply stops or refuses because the shell, `node`, or `npx` is unavailable, except for the edits that fix the error diagnostics, which are graded as a plan.
