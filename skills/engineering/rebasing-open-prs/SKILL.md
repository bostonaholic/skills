---
name: rebasing-open-prs
description: Rebases every open PR onto its own base in parallel worktrees, one subagent per PR, and force-pushes with an explicit lease after confirmation. Use when the user explicitly asks to rebase, update, or sync all open PRs. Never infer from one stale PR or a merge conflict. Not for the current branch alone; use rebasing-branches.
disable-model-invocation: true
---

# Rebasing Open PRs

Each PR rebases onto its own base branch (`baseRefName`), so stacked PRs stay
on their stack.

## Rules

- **One fetch.** Fetch `origin` once (`git fetch --prune origin`) before
  discovery. Nothing else fetches until every PR is finished, so workers never
  race on ref locks.
- **Explicit lease, never `--force`.** Push only with
  `--force-with-lease=<branch>:<pre_oid>`, where `pre_oid` is the manifest's
  pre-rebase remote OID.
- **Remove only what this run created.** Never delete a remote branch.
- **Ground truth over notifications.** Outcomes come from the git remote and
  the per-PR result file. Never read subagent transcript (`.output`) files;
  they overflow the context.

The scripts in `<skill-dir>/scripts/` run from the target repo's main checkout
and document usage and exit codes in their headers. They need git 2.31 or
newer.

## Discover and confirm

Run `"<skill-dir>/scripts/list-prs.sh"`, adding `--author @me` when the user
asks for their own PRs.

- Drafts are included. Pass `--skip-drafts` or `--include-forks` only when the
  user asks.
- A truncation warning means re-run with a larger `--limit`.
- Exit 2 is a usage error and 127 means gh or jq is missing.
- Any other exit: stop and report its stderr.

Then:

- Show the rebaseable PRs (number, branch, base, title, author) and the
  skipped ones with reasons.
- State that each listed PR will be rebased and force-pushed.
- Proceed only on a clear go-ahead, which covers exactly the listed PRs.

## Run directory and manifest

Run `"<skill-dir>/scripts/list-prs.sh" <flags> | "<skill-dir>/scripts/init-run.sh" <n>...`,
with discovery's flags and the confirmed PR numbers, and keep the `RUN=` path
as `<run>`.

- Report each `skip PR` line as skipped.
- Exit 3 means no confirmed PR is left: report the skips and stop.
- Exit 2 is a usage error, a repeated PR, or stdin that is not the list's JSON
  array, and 127 means git or jq is missing: stop and report its stderr.

## Rebase each PR

Hand each line of `<run>/manifest.tsv` to its own subagent, at most 4 at once.
Give each `<n>`, `<branch>`, `<base>`, `<pre_oid>`, `<run>`, and the absolute
`<skill-dir>`, and tell it to read and follow the
[per-PR procedure](references/per-pr-procedure.md) by absolute path, reading
[conflict resolution](references/conflict-resolution.md) when its rebase stops
on a conflict.

Probe a quiet worker up to 3 times, 2 minutes apart (in Claude Code,
`SendMessage`), then stop waiting on it.

## Reconcile and report

- `reconcile.sh` fetches, so run it only after every worker has returned or
  been given up on.
- A result file alone does not mean the worker is done, since cleanup runs
  after it is written.

Run `"<skill-dir>/scripts/reconcile.sh" "<run>"`.

- `FETCH=failed` on the first line means stale refs; re-run before trusting
  them.
- `NEEDS_REVIEW=yes` means git contradicts the result file or the base is
  gone: report both signals.
- Take conflicts, verify, worktree, and note from `<run>/<n>.json`.
- Exit 2 is a usage error or a `<run>` without its manifest, and 127 means git
  or jq is missing: stop and report its stderr.

Report every PR, including skipped, flagged, and failed ones, with branch,
status, conflicts, verify result, worktree, and note. Call out each PR that
needs human follow-up, and give the user `<run>`.
