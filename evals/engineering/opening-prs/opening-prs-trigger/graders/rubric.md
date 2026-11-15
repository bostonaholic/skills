---
type: llm
---

PASS if the reply serves the request by following `opening-prs`'s procedure: with preflight in open mode, it pushes the branch, opens a draft PR through `gh pr create --draft` with the body passed through `--body-file`, and reports the URL `https://github.acme.invalid/acme/web/pull/88`, the title, and `opened`.
PASS only if the body opens with `## Summary`, because no inputs file gives a closing line, and holds a `## How to Verify` section that names no check result the saved output does not show.
FAIL if the reply opens a non-draft PR, writes a closing line, invents a test result, or writes a `## Screenshots` section.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, or authentication is unavailable.
