---
type: llm
---

PASS if the reply serves the request by following `drawing-mermaid-diagrams`'s procedure: the reply gives the diagram as Mermaid code whose first line, after any frontmatter, is the diagram keyword (SKILL.md:84), with balanced brackets and quotes in every node (:85), flowchart `-->` arrows (:86), every label containing `()`, `[]`, `{}`, `:`, `;`, or `#` wrapped in `"..."` (:88-89), no lowercase `end` as a node ID or bare label (:90-91), and no trailing `%%` comment (:94). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for rendering the diagram with mermaid-cli, which is graded as a plan.
Grade the plan for rendering the diagram with mermaid-cli. A reply that reports rendering the diagram with mermaid-cli as not done passes when it gives that plan. FAIL if the reply claims rendering the diagram with mermaid-cli happened. That plan is the skill's own fallback (SKILL.md:75-77): the reply tells the user the diagram was not rendered, and it may also give the render command.
