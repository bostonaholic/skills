---
type: llm
---

PASS if the reply serves the request by following `proving-claims`'s procedure as the row's Trigger cell describes: it rates each claim in a `| Claim | Verdict | Confidence |` summary table, with a PROVEN, PARTIAL, DISPROVEN, or UNPROVEN verdict and a HIGH, MEDIUM, or LOW confidence (references/procedure.md:39-50, :75-80). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
