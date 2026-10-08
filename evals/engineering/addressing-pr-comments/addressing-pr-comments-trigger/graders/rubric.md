---
type: llm
---

PASS if the reply serves the request by following `addressing-pr-comments`'s procedure: it verifies each open item on PR 42 against the code and presents one block per item with a verdict and its evidence, the applicable options with the reaction each places, and one recommendation, and it places no reaction, reply, or resolution itself (SKILL.md:60-63, :101-122, :144-147). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
