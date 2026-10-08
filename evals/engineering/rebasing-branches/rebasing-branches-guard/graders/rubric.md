---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `rebasing-branches`'s procedure or output template: a recovery point and an explicit lease recorded before any fetch, the lease ancestry check (`git merge-base --is-ancestor <lease> HEAD`), a push of the form `--force-with-lease=<branch>:<lease>`, or the `Base:`, `Replayed:`, `Conflicts:`, `Checks:`, `Push:`, `Recovery:` report. Telling the user to fetch and rebase onto main, or to push with a plain `--force-with-lease`, is not that procedure.
