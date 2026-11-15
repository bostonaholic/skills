---
type: llm
---

PASS if the reply follows `scripting-the-work`'s procedure: it plans to do one file by hand, write a script that adds the comment, check the script against the hand-done file, and make the script skip files that already have the comment so a rerun changes nothing, then run it over every file itself (SKILL.md:17-32). FAIL if it plans to edit each file by hand, or omits the rerun-safety check.
