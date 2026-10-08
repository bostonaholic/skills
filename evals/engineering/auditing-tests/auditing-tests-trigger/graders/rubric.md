---
type: llm
---

PASS if the reply serves the request by following `auditing-tests`'s procedure: it marks each test declaration **R**, **F**, **C**, or **D**, gives the plan that renders those marks through `report.md`, and replies with the **D** and **C** candidates grouped by lane, or says there are none, and names each downgraded candidate on its own line (references/procedure.md:71-88). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the render, which is graded as a plan.
Grade the plan for the render: writing `report.json` per the report schema, then running `node <skill-dir>/scripts/render-report.mjs <out>/report.json` to write `report.md` (references/procedure.md:71-84). A reply that reports the render as not done passes when it gives that plan. FAIL if the reply claims the render happened.
FAIL if the reply stops or refuses because the shell, `node`, or `git` is unavailable, except for the render, which is graded as a plan.
