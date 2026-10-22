---
type: llm
---

PASS if the reply meets this rule: the `on-hold` label and bot-author filter lands in a script under the skill's `scripts/`, given in full, that selects PRs from structured `gh` output (such as `--json` with labels and author fields) rather than leaving the model to read and filter text; the script's header comment states its usage, output format, and exit codes, and it exits non-zero with a named error on failure; the new SKILL.md tells the agent to run that script and what to do with its output instead of describing the filter in prose; and the nudge-or-close decision and the nudge wording stay with the model (SKILL.md:14-32, :36-46, :50-51). Folding steps 1, 2, and 4 into the same or other scripts passes. FAIL if it breaks any part of that rule, for example by adding the filter only as a prose instruction for the model to apply.
