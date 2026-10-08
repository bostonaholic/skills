---
name: rebasing-open-prs
description: Rebases every open PR onto its own base in parallel worktrees, one subagent per PR, and force-pushes with an explicit lease after confirmation. Use when the user explicitly asks to rebase, update, or sync all open PRs. Never infer from one stale PR or a merge conflict. Not for the current branch alone; use rebasing-branches.
disable-model-invocation: true
---

# Rebasing Open PRs

Rebase each open PR onto its own base branch (`baseRefName`, so stacked PRs
stay on their stack), each in its own worktree, force-push after one
confirmation, then reconcile against the remote.

## Rules

- **Confirm before any push.** Show the plan and wait for a clear go-ahead.
- **One fetch.** Fetch `origin` once (`git fetch --prune origin`) before
  discovery. Nothing else fetches until every PR is finished, so workers never
  race on ref locks and every worker sees the remote state the manifest
  records.
- **One worktree per PR.** Work only through `git -C <worktree>`, never on the
  main checkout or another PR's worktree.
- **Explicit lease, never `--force`.** Push only with
  `--force-with-lease=<branch>:<pre_oid>`, where `pre_oid` is the manifest's
  pre-rebase remote OID.
- **Flag, don't guess.** A conflict that needs a product decision, or a
  resolution made with low confidence, is flagged for a human and not pushed.
- **Remove only what this run created.** Never delete a remote branch.
- **Ground truth over notifications.** Outcomes come from the git remote and
  the per-PR result file, never from whether a completion notification
  arrived. Never read subagent transcript (`.output`) files; they overflow the
  context.

The scripts live in `<skill-dir>/scripts/` and run from the target repo's main
checkout. Each documents its usage, output, and exit codes in its header. They
need `gh`, `jq`, and git 2.31 or newer (for `--path-format`).

## Discover and confirm

Run `"<skill-dir>/scripts/list-prs.sh"`, adding `--author @me` when the user
asks for their own PRs. It marks each PR `rebaseable` or gives a `skipReason`.
Drafts are included; forks are skipped (contributor branches usually reject
pushes); Dependabot PRs are always skipped, since another push stops
Dependabot updating them. Pass `--skip-drafts` or `--include-forks` only when
the user asks. A truncation warning means re-run with a larger `--limit`.

Show the rebaseable PRs (number, branch, base, title, author) and the skipped
ones with reasons, state that each listed PR will be rebased and force-pushed,
and proceed only on a clear go-ahead, which covers exactly the listed PRs.

## Run directory and manifest

Each run gets a fresh directory under the git common dir, which every worktree
shares and none contains, so cleanup never deletes it:

```bash
runs="$(git rev-parse --path-format=absolute --git-common-dir)/rebasing-open-prs"
mkdir -p "$runs" && run=$(mktemp -d "$runs/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX") &&
  : >"$run/manifest.tsv" && echo "RUN=$run"
```

For each confirmed PR, append a TAB-separated line `pr`, `branch`, `base`,
`pre_oid`:

```bash
if oid=$(git rev-parse --verify --quiet "refs/remotes/origin/<branch>^{commit}"); then
  printf '%s\t%s\t%s\t%s\n' <n> '<branch>' '<base>' "$oid" >>"<run>/manifest.tsv"
else
  echo "skip PR #<n>: <branch> not on origin" >&2
fi
```

Keep `--verify --quiet`: a bare `git rev-parse origin/<missing>` prints the
name back, which would record a non-OID baseline.

## Rebase each PR

Hand each manifest line to its own subagent, so one PR's conflict resolution
never fills the context that coordinates the rest. Run at most 4 at once,
starting the next as one finishes. Give each agent `<n>`, `<branch>`, `<base>`,
`<pre_oid>`, `<run>`, and the absolute `<skill-dir>`, and tell it to read and
follow the [per-PR procedure](references/per-pr-procedure.md) by absolute path,
reading [conflict resolution](references/conflict-resolution.md) when its
rebase stops on a conflict.

For a worker that has not returned and has gone quiet, probe up to 3 times, 2
minutes apart (in Claude Code, `SendMessage` to it), then stop waiting on it.
A probe reply never sets a status: git and the result file do.

## Reconcile and report

`reconcile.sh` fetches, so run it only after every worker has returned or
the bounded wait gave up on it; a fetch while one still works breaks the one-fetch rule. A result file
alone does not mean the worker is done, since cleanup runs after it is written.

```bash
"<skill-dir>/scripts/reconcile.sh" "<run>/manifest.tsv"
```

`FETCH=failed` on the first line means the per-PR lines come from stale refs;
re-run before trusting them. Derive each PR's status from its reconcile line
and `<run>/<n>.json` with the [reconcile status rules](references/reconcile-status.md).

Report every PR, including skipped, flagged, and failed ones, with branch,
status, conflicts, verify result, worktree, and note. Call out each PR that
needs human follow-up, and give the user `<run>`, which can be deleted once
they no longer need the result files.
