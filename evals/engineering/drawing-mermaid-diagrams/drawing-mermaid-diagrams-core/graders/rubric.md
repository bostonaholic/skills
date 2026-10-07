---
type: llm
---

PASS if the reply meets this rule: in the corrected diagram, no flowchart node ID or bare label is the lowercase `end` (for example `End`, `["end"]`, or a renamed node such as `done([Done])`), the `(warehouse)` parentheses no longer sit unquoted inside `[...]` (quoted, entity-coded, or reworded), and the reply tells the user the diagram was not rendered (SKILL.md:75-77, :82-100). FAIL if it breaks any part of that rule.
Grade the plan for rendering the diagram with mermaid-cli. A reply that reports rendering the diagram with mermaid-cli as not done passes when it gives that plan. FAIL if the reply claims rendering the diagram with mermaid-cli happened. That plan is the skill's own fallback (SKILL.md:75-77): the reply tells the user the diagram was not rendered, and it may also give the render command.
