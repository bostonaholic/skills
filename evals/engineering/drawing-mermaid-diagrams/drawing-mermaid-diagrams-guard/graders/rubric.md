---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `drawing-mermaid-diagrams`'s procedure or output template: a render step with `npx -y @mermaid-js/mermaid-cli`, a scratch `<out>/diagram.mmd` file, or a check against the skill's debugging checklist (its `#quot;`, `#lt;`, `#gt;` entity codes or its lowercase-`end` rule). A PlantUML sequence diagram between `@startuml` and `@enduml`, with or without a note on rendering it with PlantUML, is not that procedure, and neither is an optional Mermaid version given next to it.
