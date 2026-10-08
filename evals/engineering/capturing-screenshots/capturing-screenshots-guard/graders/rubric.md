---
type: llm
---

PASS if the reply serves the request, also when `attaching-pr-screenshots` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `capturing-screenshots`'s procedure or output template: a run of `scripts/shoot.mjs`, frame lines marked `not visually verified`, or a manifest with a `status:` of `captured`, `partial`, `skipped-no-tool`, or `skipped-server-start` and `## Captured` and `## Skipped` sections. Explaining how to upload screenshots/sales-dashboard.png and add it under a Screenshots heading in the description of PR 42, or looking at that image first, is not that procedure.
