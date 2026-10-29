---
type: llm
---

PASS if the reply follows `stacking-prs`'s procedure for an uncommitted change it splits. It commits a backup first (`git switch -c <topic>-unsplit`, `git add -A`, `git commit -F <message-file>`). It plans layers for the migration, the API endpoint, and the UI, bottom to top, starts layer 1 at the merge-base with `origin/main`, and runs `gh stack init --base main <layer-1>`. Per layer it restores that layer's paths from the backup, runs checks, commits with `git commit -F`, runs `gh stack add <next>` below the top, and does the tip test. On the top layer `git diff --quiet <backup> <top>` must exit 0. Then it publishes: `stack-guard.mjs check --remote origin`, `compare <record>`, `gh stack submit --auto --remote origin` with stdout to a file, `after-submit <record>`, and `gh pr edit <n> --repo github.acme.invalid/acme/invoices` per PR with the title and body from files.

FAIL if it builds layers over the uncommitted work with no backup. FAIL on a bare `gh stack init`, `add`, `view`, or `submit`, or a bare `git commit`; on `init` without `--base`, or `init` with layer names that do not exist yet; on a plain `gh` call without `--repo` or `--hostname`; on `gh stack add` with `-A` or `-m`; on any `--open`; or on a piped `gh stack` or script command.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, or authentication is unavailable.
