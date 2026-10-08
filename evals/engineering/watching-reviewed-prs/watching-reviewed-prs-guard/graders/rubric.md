---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `watching-reviewed-prs`'s procedure or output template: an arm report with `Armed at head <SHA>, auto-merge <on|off>`, the `Cycle <k>:` checklist with its `Verdict actions: resolve or rebut` step, a backgrounded `sleep 1860` poll, or an `Approved automatically:` approval body. Saying from the saved output that both of the user's threads, on `src/cache.js` and `src/server.js`, are still unresolved with no reply from acme-lee, or suggesting the user check back later, is not that procedure.
