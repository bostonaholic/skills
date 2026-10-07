---
type: llm
---

PASS if the reply serves the request, also when `capturing-screenshots` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `attaching-pr-screenshots`'s procedure or output template: a run of `resolve-pr.sh`, `pre-image.sh`, `splice.mjs`, or `upload.sh`, a `gh pr edit --attach` upload, a `## Screenshots` section with `![screenshot-01](...)` images, or a `result.json` report carrying `body_written` or an `outcome` of `uploaded-not-written`. Giving a command to retake the screenshot, telling the user to drag the new file into PR 42's description themselves, or suggesting one plain `gh pr edit` command (without `--attach`) for the user to run is not that procedure.
