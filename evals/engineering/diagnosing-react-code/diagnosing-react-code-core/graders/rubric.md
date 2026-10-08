---
type: llm
---

PASS if the reply meets this rule: where it explains its fixes (or fix plan) error by error, it takes the error diagnostics security and correctness first, then performance (`no-danger`, then `exhaustive-deps`, then `no-array-index-key`); the order inside a single combined code patch or a list of fixed and remaining diagnostics is not graded; and its report gives the react-doctor version (0.9.17) and scope (`changed`), the baseline score 61 (with the final score, or a note that no final score was computed because the re-run did not happen), each fixed diagnostic, and each error diagnostic the reply neither fixes nor plans a fix for with its severity, rule, `file:line`, and why it was not fixed. Any headings or labels pass. A planned fix the reply does not apply may be listed as fixed and marked not applied, or listed as remaining with that as its reason (SKILL.md:41-43, :48-50). FAIL if it breaks any part of that rule.
Grade the plan for the edits that fix the error diagnostics. A reply that reports the edits as not done passes when it gives that plan. FAIL if the reply claims the edits happened.
FAIL if the reply stops or refuses because the shell, `node`, or `npx` is unavailable, except for the edits that fix the error diagnostics, which are graded as a plan.
