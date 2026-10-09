---
type: llm
---

Judge the final reply only. The dispatch grader checks verifier inputs separately.

PASS when the reply reports a separate check of the repeated finding against current code, identifies Math.min as the fix, and traces the reported 10% example to a 1000-cent discount or a 9000-cent total. Short commit identifiers are sufficient. The reply must distinguish this current verification from the original report about the earlier Math.max code; it need not repeat the original verdict label (SKILL.md:30-35).

FAIL when the reply reports the old finding as still present, relies only on its old permalink, replaces the original report's verdict with its new conclusion, or approves newer commits solely from a cached verdict. A separate current COMMENT verdict because tests could not run is allowed (SKILL.md:30-35; references/code-reviewer.md:63-66).
