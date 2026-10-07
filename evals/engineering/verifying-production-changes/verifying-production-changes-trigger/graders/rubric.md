---
type: llm
---

PASS if the reply serves the request by following `verifying-production-changes`'s procedure: it gates on the deploy by ancestry of 4f2a9c1 in the running revision 9a4c6d1, not by sha equality, requires all five sampled requests on that revision, and states the result as a bound on the 5 sampled requests rather than claiming the fleet is fully deployed (SKILL.md:13-40). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `git`, or `curl` is unavailable.
