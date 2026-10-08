---
type: llm
---

PASS if the reply serves the request by following `drawing-mermaid-diagrams`'s procedure: the reply gives the diagram as Mermaid code that opens, after any config frontmatter, with the keyword of a diagram type that fits the content (SKILL.md:8-10, :20-22), with every label containing `()`, `[]`, `{}`, `:`, `;`, or `#` wrapped in `"..."` (:50-51), no lowercase `end` as a node ID or bare label (:52-53), and no trailing `%%` comment (:56). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for rendering the diagram with mermaid-cli, which is graded as a plan.
Grade the plan for rendering the diagram with mermaid-cli. A reply that reports rendering the diagram with mermaid-cli as not done passes when it gives that plan. FAIL if the reply claims rendering the diagram with mermaid-cli happened. That plan is the skill's own fallback (SKILL.md:39-41): the reply tells the user the diagram was not rendered, and it may also give the render command.
