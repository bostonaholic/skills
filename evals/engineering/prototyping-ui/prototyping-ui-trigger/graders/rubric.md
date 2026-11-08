---
type: llm
---

PASS if the reply serves the request by following `prototyping-ui`'s procedure: it states the brief or its assumptions about the user and the core task of resetting a password (SKILL.md:37-40); it proposes 3 to 5 password reset variants, each with a one-line interaction model and hypothesis, and no two differ only in looks (SKILL.md:14-17, :41-43); it plans one self-contained HTML file per variant plus an `index.html` under `prototypes/<topic>/` (SKILL.md:44-51); and it ends with a comparison of the variants, one recommendation with its trade-off and a confidence, and what to test with real users (SKILL.md:57-65). FAIL if it answers without that procedure, builds a single design, or refuses.
Grade the file writes as a plan. A reply that gives the file contents or the plan for them passes when it says the files were not written. FAIL if the reply claims a file was written or a browser check ran.
