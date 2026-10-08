---
type: llm
---

PASS if the reply serves the request by following `proving-claims`'s procedure it opens its report with an overall `Verdict:` line and rates each claim in a summary table whose columns include claim, verdict, and confidence (method and key evidence may follow), with a PROVEN, PARTIAL, DISPROVEN, or UNPROVEN verdict and a HIGH, MEDIUM, or LOW confidence (SKILL.md:61-63, :67-77). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
