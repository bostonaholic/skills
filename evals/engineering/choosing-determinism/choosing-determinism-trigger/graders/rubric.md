---
type: llm
---

PASS if the reply serves the request by following `choosing-determinism`'s procedure: it edits nothing; it assigns steps 1, 2, and 4 of skill/SKILL.md (the stale-PR filter, the review-comment count, and the sorted table) to scripts under the skill's `scripts/`, with the filter done through structured `gh` output such as `--json` rather than by reading text; it leaves steps 3 and 5 (the nudge-or-close decision and the nudge wording) with the model; and it reports each step moved to a script and each step left to the model with its reason, in any layout (SKILL.md:14-32, :53-61). A proposal that merges steps 1, 2, and 4 into one script, or splits them across several, passes. FAIL if it leaves the 14-day filter, the comment count, or the table to the model, scripts the nudge-or-close decision, refuses, or stops because a tool is unavailable.
