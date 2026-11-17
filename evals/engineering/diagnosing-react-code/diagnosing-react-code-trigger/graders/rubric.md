---
type: llm
---

PASS if the reply serves the request by following `diagnosing-react-code`'s procedure: with Node and `npx` present, it asks the user before the first run of the third-party scanner and names the pinned version, `react-doctor@0.9.17` (SKILL.md:16-17, :29). FAIL if it answers without that procedure or refuses.
FAIL if the reply stops or refuses because the shell, `node`, or `npx` is unavailable, except for the scanner run, which is graded as a plan: the procedure stops for approval before that run, so a reply that asks for approval of `react-doctor@0.9.17` and gives the command passes even when it says the shell is unavailable.
