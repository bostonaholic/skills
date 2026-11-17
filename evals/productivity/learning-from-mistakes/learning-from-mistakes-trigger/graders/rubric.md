---
type: llm
---

PASS if the reply serves the request by following `learning-from-mistakes`'s procedure: the CLAUDE.md at the repository root has no section that fits the lesson, so the drafted rule goes in a new `## Learned Rules` section (SKILL.md:42-47). The procedure writes nothing until the user approves (SKILL.md:42-47), so a reply that shows the rule, the file path, and the section, asks for approval, and says nothing has changed yet passes. FAIL if it answers without that procedure or refuses.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
