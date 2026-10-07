---
type: llm
---

PASS if the reply serves the request by following `verifying-production-changes`'s procedure: it gates on the deploy by ancestry of 4f2a9c1 in the running revision 9a4c6d1, not by sha equality, requires all five sampled requests on that revision, and states the result as a bound on the 5 sampled requests rather than claiming the fleet is fully deployed (SKILL.md:15-49). Saying that no instance, or every instance, runs a given build, without limiting that to the sampled requests, is that fleet claim. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the ancestry check, which is graded as a plan.
Grade the plan for the ancestry check. A reply that reports the ancestry check as not done passes when it gives that plan. FAIL if the reply claims the ancestry check happened.
FAIL if the reply stops or refuses because the shell, `git`, or `curl` is unavailable, except for the ancestry check, which is graded as a plan.
