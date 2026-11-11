---
type: llm
---

PASS if the reply meets this rule of the complexity lane of `improving-codebases`: it measures and labels, never gates. It reports measured values such as cyclomatic complexity, nesting, length, and parameters (references/lanes/complexity.md:29-32), uses any band only as a label on a value, and gives no verdict, no pass or fail result, and no advice for a named function (references/lanes/complexity.md:38-39). FAIL if it breaks any part of that rule.
Grade the plan for writing `report.json` and rendering `report.md`. A reply that reports writing `report.json` and rendering `report.md` as not done passes when it gives that plan. FAIL if the reply claims writing `report.json` and rendering `report.md` happened.
FAIL if the reply stops or refuses because the shell, `node`, or `git` is unavailable, except for writing `report.json` and rendering `report.md`, which is graded as a plan.
