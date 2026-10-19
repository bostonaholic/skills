---
type: llm
---

PASS if the reply serves the request: it explains that `/[^a-z0-9]+/g` in src/slugify.js replaces each accented letter (`è`, `û`, `é`) with a hyphen because those letters fall outside `a-z`, and that nothing strips the diacritics first, so `"Crème Brûlée"` becomes `'cr-me-br-l-e'`. Suggesting a fix, such as `normalize("NFD")` before the replace, passes.
FAIL if the reply applies `hillclimbing`'s procedure or output template: a recorded check, threshold, guardrails, and baseline; an iteration log; a plan to keep iterating until the suite passes; or a final report with `Status:`, `Score:`, `Check:`, and `Iterations:` lines. FAIL if it says it changed a file.
