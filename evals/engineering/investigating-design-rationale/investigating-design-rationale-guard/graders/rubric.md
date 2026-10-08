---
type: llm
---

PASS if the reply serves the request, also when `explaining-architecture` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `investigating-design-rationale`'s procedure or output template: claims tagged `[Direct]`, `[Supported]`, `[Inferred]`, or `[Speculative]`, the sections What We Found, What We Can Reasonably Infer, Competing Hypotheses, What We Don't Know, or Sources Consulted. Explaining how the retry loop and its backoff work, including naming the commit or PR that last changed the limit and the reason that commit or PR states, is not that procedure.
