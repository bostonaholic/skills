---
type: llm
---

PASS if the reply serves the request by following `attaching-pr-screenshots`'s procedure: it reaches the upload without stopping at steps 1-4, because the saved required-tools check, PR resolution, pre-image, and `splice.mjs --check` body check all pass (SKILL.md:65-74). A reply that goes straight to the plan for steps 5-7 meets this clause. The `## Screenshots` section is written only at step 6, after an upload this session cannot do. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the upload and body write (steps 5-7), which is graded as a plan.
Grade the plan for the upload and body write (steps 5-7: upload each image with `scripts/upload.sh`, render the section and splice it into the pre-image with `scripts/splice.mjs`, write the body once, then verify the rendered body; SKILL.md:75-80). A reply that reports the upload and body write as not done passes when it gives that plan. FAIL if the reply claims the upload and body write happened.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable, except for the upload and body write (steps 5-7), which is graded as a plan.
