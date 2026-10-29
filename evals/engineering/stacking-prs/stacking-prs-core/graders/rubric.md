---
type: llm
---

PASS if the reply follows `stacking-prs`'s change path for a pushed stack. It keeps the `RECORD` from `check --remote origin`. It moves to the owning layer `invoices/schema` with `gh stack bottom` (or `down` or `checkout invoices/schema`), adds the index, commits with `git commit -F <message-file>`, and runs that layer's checks. Then it runs `gh stack view --json`, cascades with `gh stack rebase --upstack --no-trunk invoices/api`, and runs the checks on `invoices/api` and `invoices/ui`. Then `compare <record>`, then `gh stack push --remote origin`.

FAIL on a commit on `invoices/ui`; on `git push --force`; on a push with no `check`, no `compare`, or no `--remote`; on checks on only the changed layer and the top layer; on `gh stack switch` or `gh stack modify`; on a bare `gh stack view`; on a piped `gh stack` or script command; or on any change to a PR's base.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, or authentication is unavailable.
