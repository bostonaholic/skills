---
type: llm
---

PASS if the reply serves the request by following `diagnosing-react-code`'s procedure: with Node and `npx` present, it asks the user before the first run of the third-party scanner and names the pinned version, `react-doctor@0.9.17` (SKILL.md:16-17, :28). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `node`, or `npx` is unavailable.
