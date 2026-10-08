---
type: llm
---

PASS if the reply meets this rule: the deploy is judged by ancestry, not equality, and a mixed sample is a rollout in progress (SKILL.md:16-31). It treats 4f2a9c1 as contained in the running revision 9a4c6d1 by ancestry, though the two shas differ, and reports the poll as a rollout in progress with the count of samples or instances still on the prior revision (for example 4 of 5 sampled requests on 9a4c6d1, or 3 of 4 observed instances), not as a failure and not as deployed. Naming the stale instance or its sha is not required. FAIL if it breaks any part of that rule.
FAIL if the reply stops or refuses because the shell, `git`, or `curl` is unavailable.
