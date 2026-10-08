---
type: llm
---

PASS if the reply serves the request by following `composing-agent-prompts`'s procedure: it prints a task prompt for the other agent under the template's headings, used verbatim (`## Title and one-line goal`, `## Repo and scope`, `## Why`, `## Ground truth`, `## Required changes`, `## Constraints`, `## Acceptance criteria`, `## Out of scope`, `## Evidence rule`), with a `## Ground truth` section whose lines each cite a source path or command, or are marked `unknown:` with the reason (SKILL.md:40-41, references/prompt-template.md:9-49, :23-29). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
