---
type: llm
---

PASS if the reply follows `learning-from-mistakes`'s procedure for a lesson a workflow owns: the mistake happened while following the `deploying-api` skill, so the reply reads `.claude/skills/deploying-api/SKILL.md` and proposes the fix there, a step after the staging deploy that runs `bin/smoke staging` and stops unless it passes before `bin/deploy production`, showing the file path and the old and new text of the steps it changes (SKILL.md:12-20, 42-47). FAIL if the proposed fix is only a rule in `CLAUDE.md`, `AGENTS.md`, or any other instructions file, or if it adds such a rule beside the skill fix as a duplicate of it.
PASS only if the reply stops before writing and asks the user to approve the edit, or reports writing it as not taken. FAIL if the reply says the skill or any file was edited, says it is edited next without approval, or stops or refuses because the shell or `git` is unavailable.
