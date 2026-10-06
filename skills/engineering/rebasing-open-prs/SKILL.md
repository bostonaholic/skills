---
name: rebasing-open-prs
description: Rebases every open PR onto its own base in parallel worktrees, one subagent per PR, and force-pushes with an explicit lease after confirmation. Use when the user explicitly asks to rebase, update, or sync all open PRs. Never infer from one stale PR or a merge conflict. Not for the current branch alone; use rebasing-branches.
disable-model-invocation: true
---

# Rebase Open PRs onto Their Base

Rebase each open PR onto its own base branch (`baseRefName`, so stacked PRs
stay on their stack). Each PR gets its own git worktree and subagent; results
are force-pushed after one confirmation and then reconciled against the
remote.

## Rules

- **Confirm before any push.** Show the plan and wait for a clear go-ahead.
- **One worktree per PR.** Agents act only through `git -C <worktree>`; never on
  the main checkout or another agent's worktree.
- **Explicit lease, never `--force`.** Push only with
  `--force-with-lease=<branch>:<pre_oid>`, where `pre_oid` is the manifest's
  pre-rebase remote OID.
- **Flag, don't guess.** A conflict that needs a product decision, or a
  resolution made with low confidence, is flagged for a human and not pushed.
- **Remove only what this run created.** Never delete a remote branch.
- **Ground truth over notifications.** Outcomes come from the git remote and the
  per-PR result file, never from whether a completion notification arrived.
  Never read agent transcript (`.output`) files; they overflow the
  orchestrator's context.

Read each linked file from this skill's directory when the step that uses it begins. If a read fails, stop that step and report the exact path.

## Requirements

`gh` (authenticated, with push access), `jq`, and git 2.31 or newer (for
`--path-format`):

```bash
command -v gh >/dev/null && command -v jq >/dev/null && gh auth status && git version
```

If any is missing, stop and tell the user which. The scripts below live in
`<skill-dir>/scripts/`; pass agents the absolute `<skill-dir>`. Run scripts
from the target repo's main checkout. Each prints diagnostics on stderr and its
result (`KEY=VALUE` lines or JSON) on stdout, and documents its usage and exit
codes in its header.

Copy this checklist and check off each step:

```text
- [ ] 1. Fetch
- [ ] 2. Discover open PRs
- [ ] 3. Confirm the plan
- [ ] 4. Create the run directory and manifest
- [ ] 5. Dispatch agents, 4 at a time
- [ ] 6. Reconcile and report
```

## 1. Fetch

From the target repo's main checkout:

```bash
git fetch --prune origin
```

This is the only fetch until every agent has finished (step 6). Agents do not
fetch, so they never race on ref locks and every agent sees the remote state
the manifest records.

## 2. Discover open PRs

Run `"<skill-dir>/scripts/list-prs.sh"`, adding `--author @me` when the user
asks for their own PRs. It prints a JSON array; each item has `rebaseable` and,
when skipped, `skipReason`. Drafts are included and forks are skipped
(contributor branches usually reject pushes). Dependabot PRs are always skipped,
since another push stops Dependabot updating them. Pass `--skip-drafts` or
`--include-forks` only when the user asks. A truncation warning on stderr
means more open PRs exist than `--limit`: re-run with a larger limit.

## 3. Confirm the plan

Show the rebaseable PRs (number, branch, base, title, author) and the skipped
ones with reasons. State that each listed PR will be rebased and force-pushed.
Proceed only on a clear go-ahead; it covers exactly the listed PRs.

## 4. Create the run directory and manifest

Each run gets a fresh directory under the git common dir, which all worktrees
share and none contains, so cleanup never deletes it and earlier runs stay
intact:

```bash
runs="$(git rev-parse --path-format=absolute --git-common-dir)/rebasing-open-prs"
mkdir -p "$runs" && run=$(mktemp -d "$runs/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX") &&
  : >"$run/manifest.tsv" && echo "RUN=$run"
```

Call the printed path `<run>`. For each confirmed PR, append one
TAB-separated line `pr`, `branch`, `base`, `pre_oid`:

```bash
if oid=$(git rev-parse --verify --quiet "refs/remotes/origin/<branch>^{commit}"); then
  printf '%s\t%s\t%s\t%s\n' <n> '<branch>' '<base>' "$oid" >>"<run>/manifest.tsv"
else
  echo "skip PR #<n>: <branch> not on origin" >&2
fi
```

Keep `--verify --quiet`: a bare `git rev-parse origin/<missing>` prints the
name back, which would record a non-OID baseline.

## 5. Dispatch agents, 4 at a time

Spawn one general-purpose subagent per manifest line. Run at most 4 at once,
which keeps each conflict resolution careful and the machine responsive; start
the next as one finishes. Hand each agent `<n>`, `<branch>`, `<base>`,
`<pre_oid>`, `<run>`, and `<skill-dir>`, and tell it to read and follow the
[per-PR procedure](references/per-pr-procedure.md) by absolute path. Agents
read [conflict resolution](references/conflict-resolution.md) when their rebase
stops on a conflict.

## 6. Reconcile and report

`reconcile.sh` fetches, so run it only after every dispatched agent has
finished: it returned its summary, or the bounded wait below gave up on it. A
fetch while an agent still works breaks step 1's guarantee. A result file alone
does not mean the agent is done, since cleanup runs after it is written.

**Bounded wait.** For an agent that has not returned and has gone quiet, probe
up to 3 times, 2 minutes apart. In Claude Code, the probe is `SendMessage` to
that agent; a reply that it had no active task means it has stopped. On other
hosts, the probe is the wait itself. Once the agent has stopped, or after the
third probe, stop waiting on it. A probe reply never sets a status: git and the
result file do.

Then reconcile. It is mandatory and independent of notifications, read-only
apart from the fetch, and safe to repeat:

```bash
"<skill-dir>/scripts/reconcile.sh" "<run>/manifest.tsv"
```

`FETCH=failed` on the first line means the per-PR lines come from stale refs;
re-run before trusting them. Derive each PR's status from its reconcile line and
`<run>/<n>.json` with the [reconcile status rules](references/reconcile-status.md).

Report every PR, including skipped, flagged, and failed ones:

```text
| PR | Branch | Status | Conflicts | Verify | Worktree | Note |
```

Call out each PR that needs human follow-up. Give the user `<run>`; it sits
under `.git` and can be deleted once they no longer need the result files.
