---
type: llm
---

PASS if the reply serves the request by following `auditing-complexity`'s procedure and listing these items from its final step: the top 5 files and the top 5 functions ranked by cyclomatic complexity, each exclusion with its reason, and one count per gap reason (references/procedure.md:139-153). A ranking taken from the analysts' measurements, with the `report.json` and `report.md` paths given as planned rather than written, passes. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for writing `report.json` and rendering `report.md`, which is graded as a plan.
Grade the plan for writing `report.json` and rendering `report.md`. A reply that reports writing `report.json` and rendering `report.md` as not done passes when it gives that plan. FAIL if the reply claims writing `report.json` and rendering `report.md` happened.
FAIL if the reply stops or refuses because the shell, `node`, or `git` is unavailable, except for writing `report.json` and rendering `report.md`, which is graded as a plan.
