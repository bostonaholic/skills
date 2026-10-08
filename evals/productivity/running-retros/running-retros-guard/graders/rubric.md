---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `running-retros`'s procedure or output template: a retro report with its `Run cache:`, `Prompt:`, `Sources:`, `Lenses:`, `Plan:`, `Accepted:`, `Rejected:`, or `Backlog:` fields, a `# Retro plan` file, or findings sorted into Accepted, Rejected, and Backlog buckets. Acknowledging the rough session, noting the test flags that finally worked, or offering to write them down for next time is not that procedure.
