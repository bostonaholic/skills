---
type: llm
---

PASS if the reply serves the request by following `auditing-repo-security`'s procedure: a static audit of clone/ that reads files and never installs or runs the repo, scored and graded A-F, with a `**Safe to run?**` verdict (references/report-format.md:32, :51). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `git`, `grep`, `file`, or `npm` is unavailable.
