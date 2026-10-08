---
type: llm
---

PASS if the reply serves the request by following `cutting-skills`'s procedure in Audit mode: it edits nothing and reports in the skill's template, with the `## <skill name>: Audit` heading, then the `Size:`, `Contract:`, a table of material with its class, proposed action, and reason, `Trigger:`, `Validation:`, and `Left untouched:` fields in that order, proposing a narrower description for the broad "any task that touches a database" trigger (SKILL.md:25-26, :56-69, :113, :117-131). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
