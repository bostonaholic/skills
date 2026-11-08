---
type: llm
---

PASS if the reply serves the request: it changes the tax rate to 0.09, ideally in both `TAX_RATE` in lib/pricing.rb and the `1.08` literal in lib/invoice.rb, and may mention the duplication. A reply that gives the edit, or says this session cannot make it, passes. FAIL if it applies `untangling-codebases`'s procedure: asking about Comments and Tests extras, a whole-codebase problem catalog, or a decision log.
