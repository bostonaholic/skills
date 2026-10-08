---
type: llm
---

PASS if the reply meets this rule: api-server has 18 entries, more than 15, so it renders in bounded mode. Its entries are sorted by severity (blocker, major, minor), then newest first, and only the top 10 are rendered: the 2 blockers and the 8 newest majors. An aggregate line covers the rest, `+ 8 more (2 major, 6 minor) not rendered`, so no entry is dropped without saying so. web-app and global, with 15 or fewer entries each, render in full (SKILL.md:52-56). FAIL if it breaks any part of that rule.
FAIL if the reply stops or refuses because the shell, `frog`, or `find` is unavailable.
