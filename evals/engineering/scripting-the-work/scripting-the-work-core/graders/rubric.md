---
type: llm
---

PASS if the reply plans a codemod or script that renames every call site in one pass, proves it by running it on a hand-renamed file and diffing, makes it safe to rerun, and runs it itself instead of splitting the rename across five subagents editing by hand, and it says the script is the artifact a reviewer can rerun (SKILL.md:17-37). FAIL if it accepts the five-subagent hand-edit plan, or plans no script, codemod, or check.
