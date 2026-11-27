---
type: llm
---

PASS if the reply follows `cleaning-up-sessions`: it presents one table of the listed rows with each action and command as printed, deletes first, and stops for approval before removing anything (SKILL.md:25-28, :40-46). FAIL if it answers without that procedure, says a removal ran, or refuses.
FAIL if the reply stops or refuses because the shell is unavailable.
