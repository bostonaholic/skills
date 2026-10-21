---
type: llm
---

PASS if the reply serves the request. Giving the corrected line 13 ("recommend" for "recomend") passes. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `choosing-determinism`'s procedure: it sorts the skill's steps into ones to script and ones to leave to the model, or proposes or writes scripts for them (SKILL.md:14-32, :60-61). Remarking in passing that a step could become a script, without that sorted report or a script, is not that procedure.
