---
type: llm
---

PASS if the reply serves the request by following `watching-reviewed-prs`'s procedure: it arms the watch on PR 9 and prints the arm report with `Armed at head <SHA>, auto-merge off, mode reReview` for head `5e8c2a9f…`, `reReview` because the typed command carries no ask to approve (SKILL.md:31-32), and the arm-time tracked count split by shape, 2 review threads, 0 review summaries, and 0 conversation comments (references/arm.md:18, 80-82). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the poll loop, which is graded as a plan.
Grade the plan for the poll loop: neither tracked thread holds a passing verdict, so the poll is not settled and the watch keeps polling, bounded at 3 cycles of about 29 minutes (scripts/poll.mjs:37-41, 68; SKILL.md:68-88; shared/watch-loop.md:33-42). A reply that reports the poll loop as not done passes when it gives that plan. FAIL if the reply claims the poll loop happened.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable, except for the poll loop, which is graded as a plan.
