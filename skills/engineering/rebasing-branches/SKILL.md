---
name: rebasing-branches
description: Rebases the current branch onto its PR or default base, resolves conflicts by intent, re-runs the project's checks, and force-pushes with an explicit lease. Use when the user explicitly asks to rebase the current branch. Never infer from a behind branch. Not for rebasing every open PR; use rebasing-open-prs.
effort: high
argument-hint: "[<pr-number-or-url>]"
disable-model-invocation: true
---

# Rebasing Branches

Rebase the current branch onto the latest base, resolve conflicts from both
sides' intent, and confirm the branch still works before publishing it. The
explicit invocation authorizes the history rewrite and the force-push; do not
stop to confirm them. This skill does not wait for CI and does not merge.

## Before starting

Refuse to start on a detached HEAD, a dirty tracked tree
(`git status --porcelain --untracked-files=no` prints anything), or a rebase or
merge already in progress. Refuse an argument that is neither a number nor an
`https://` PR URL.

The argument selects the base only; the branch rebased is always the current
checkout. With a PR, the base is its `baseRefName` in the repository its URL
names; without one, the default branch of the repository `gh repo view`
targets (the upstream for a fork gh knows about). Validate the base with
`git check-ref-format --branch`, refuse when the current branch is the base,
and rebase onto the remote whose URL is that repository, not whatever remote is
named `origin`.

## Recovery point and lease, before any fetch

Record where the branch is, where a plain `git push` sends it, and what that
remote copy was last seen as:

```bash
branch=$(git branch --show-current)
push_remote=$(git for-each-ref --format='%(push:remotename)' "refs/heads/$branch")
echo "RECOVERY=$(git rev-parse HEAD) PUSH_REMOTE=${push_remote:-origin}"
if push_ref=$(git rev-parse --symbolic-full-name '@{push}' 2>/dev/null); then
  echo "PUSH_BRANCH=${push_ref#"refs/remotes/$push_remote/"} LEASE=$(git rev-parse "$push_ref")"
else
  echo "PUSH_BRANCH=$branch LEASE=none"
fi
```

- **`LEASE=<oid>`:** `git merge-base --is-ancestor <lease> HEAD` must succeed.
  If it fails, stop before fetching and report "remote has commits this branch
  lacks; integrate them first".
- **`LEASE=none`:** no tracked remote copy. If `gh pr view` finds a PR for the
  branch, stop and tell the user to run `gh pr checkout <n>` or set the
  upstream. With no PR, the publish is a first push.

The lease must predate the fetch: a fetch moves the remote-tracking ref, so a
lease taken after it would accept commits this branch never saw. Together, the
ancestry check and the lease confine the force-push to commits the branch
already contains. Whenever the run stops after this point, report
`git rebase --abort` (if a rebase is in progress) and
`git reset --hard <recovery>`.

## Baseline checks

Run the project's checks (from its agent instructions, package scripts,
Makefile, and CI workflow) once before rebasing and record each command and
exit code. A check that already fails does not block the rebase; it is the
baseline the post-rebase run is compared against.

## Rebase

Fetch only the base from its remote, then rebase onto
`refs/remotes/<base-remote>/<base>`. Add `--rebase-merges` when the branch has
merge commits since the base (`git rev-list --merges --count`), or the rebase
flattens them.

On a conflict, read all three stages (`git show :1:<path>` is the common
ancestor) and keep both sides' intent. During a rebase `--ours` (stage 2) is
the base and `--theirs` (stage 3) is the commit being replayed, the reverse of
a merge. Never take a side whole and never `git rebase --skip`. When the code
and its history do not decide a conflict, ask the user. Continue with
`GIT_EDITOR=true git rebase --continue`.

## Verify, then publish

Re-run every baseline check the same way. A check that passed before and fails
now stops the run, as does an undecided conflict; nothing reaches the remote
while either stands.

With a recorded lease:

```bash
git push --force-with-lease=<push-branch>:<lease> <push-remote> <branch>:<push-branch>
```

With `LEASE=none`, use `git push -u <push-remote> <branch>`, which git rejects
unless it fast-forwards. Never use a bare `--force`. A lease rejection means
the remote moved since the lease was recorded: stop and report it without
retrying. After pushing, confirm `git ls-remote` shows the local `HEAD`.

Report the base, commits replayed, each conflict and how both intents were
kept, each check before and after, the push result, and `git reset --hard <recovery>`.
