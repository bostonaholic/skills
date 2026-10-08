---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `cutting-skills`'s procedure or output template: a `## writing-db-migrations: Audit` or `## writing-db-migrations: Cut` heading, a `Size: SKILL.md <before> -> <after> lines` line, a `Contract:` line, a table with `Material`, `Class`, `Action`, and `Reason` columns, or any of the `Trigger:`, `Validation:`, or `Left untouched:` fields. Giving the corrected line 12 ("understand" for "undrestand"), or remarking in passing that the description is broad or that parts of the file could be shortened, without the heading, Size line, material table, or report fields above, is not that procedure.
