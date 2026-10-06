---
name: rebasing-branches
description: Rebases the current branch onto its PR or default base, resolves conflicts by intent, re-runs the project's checks, and force-pushes with an explicit lease. Use when the user explicitly asks to rebase the current branch. Never infer from a behind branch. Not for rebasing every open PR; use rebasing-open-prs.
effort: high
argument-hint: "[<pr-number-or-url>]"
disable-model-invocation: true
---

# rebasing-branches: rebase onto the latest base

Fetch the base, rebase the current branch onto it, resolve conflicts from both
sides' intent, and confirm the branch still works before publishing it. The
explicit invocation authorizes the history rewrite and the force-push; do not
stop to confirm them. This skill does not wait for CI and does not merge.

Copy this checklist and check off each step:

```text
- [ ] 1. Preflight
- [ ] 2. Resolve the base and its remote
- [ ] 3. Record the recovery point and lease
- [ ] 4. Run baseline checks
- [ ] 5. Fetch and rebase
- [ ] 6. Re-run checks and compare
- [ ] 7. Publish with an explicit lease
- [ ] 8. Report
```

## 1. Preflight

```bash
command -v gh >/dev/null && command -v git >/dev/null && gh auth status
git branch --show-current
git status --porcelain --untracked-files=no
for p in rebase-merge rebase-apply MERGE_HEAD; do
  [ -e "$(git rev-parse --git-path "$p")" ] && echo "in progress: $p"
done
```

If gh is missing or not authenticated, stop and tell the user to install it or
run `gh auth login`. Refuse to start on a detached HEAD (empty branch name), a
dirty tracked tree (any `status` output), or a rebase or merge already in
progress (any `in progress` line). Refuse an argument that is neither a number
nor an `https://` PR URL.

## 2. Resolve the base and its remote

The argument selects the base only; the branch rebased is always the current
checkout.

- **PR number or URL given:** a failed lookup stops the run.

  ```bash
  gh pr view <pr-number-or-url> --json baseRefName,url --jq '.baseRefName + " " + .url'
  ```

  The base repository is the `<owner>/<repo>` part of the printed URL.

- **No argument:** use the default branch of the repository gh targets, which
  is the upstream when the checkout is a fork that gh knows about.

  ```bash
  gh repo view --json defaultBranchRef,nameWithOwner --jq '.defaultBranchRef.name + " " + .nameWithOwner'
  ```

Validate the base with `git check-ref-format --branch <base>`. Refuse to run
when the current branch is the base. Find the remote that owns the base
repository:

```bash
for r in $(git remote); do
  case "$(git remote get-url "$r")" in
    *[:/]"<owner>/<repo>" | *[:/]"<owner>/<repo>".git) echo "$r"; break ;;
  esac
done
```

No match: stop and report the repository and `git remote -v`. Call the match
`<base-remote>`.

## 3. Record the recovery point and lease

Before any fetch, record where the branch is, where a plain `git push` sends
it (`@{push}`), and what that remote copy was last seen as:

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

- **`LEASE=none`:** `@{push}` does not resolve, so this checkout tracks no
  remote copy of the branch. If `gh pr view --json url` (no argument) finds a
  PR for the branch, stop: the PR's branch lives somewhere this checkout does
  not track. Tell the user to run `gh pr checkout <n>` or set the upstream,
  then re-run. With no PR, step 7 makes a first push.
- **`LEASE=<oid>`:** the branch must already contain it:

  ```bash
  git merge-base --is-ancestor <lease> HEAD
  ```

  A non-zero exit means the remote has commits this branch lacks. Stop and
  report "remote has commits this branch lacks; integrate them first".

Together these confine the step 7 force-push to commits the branch already
contains: the ancestry check covers what the remote-tracking ref holds, and
the lease rejects anything pushed after it. The lease must predate the fetch:
a fetch moves the remote-tracking ref, so a lease taken after it would accept
commits this branch never saw. Whenever the run stops after this step, report
`git rebase --abort` (if a rebase is in progress) and
`git reset --hard <recovery>`.

## 4. Run baseline checks

Find the project's checks in its agent instructions (`AGENTS.md`, `CLAUDE.md`),
`package.json` scripts, `Makefile` targets, and CI workflow steps. Run each
once, fastest first (format, lint, typecheck, build, test), and record the
exact command and exit code. Run a suite that takes more than about a minute
with `run_in_background: true`. A check that already fails here does not block
the rebase; step 6 compares against it.

## 5. Fetch and rebase

```bash
git fetch <base-remote> <base>
git rev-list --merges --count "refs/remotes/<base-remote>/<base>..HEAD"
git rebase "refs/remotes/<base-remote>/<base>"
```

Add `--rebase-merges` when the count is above zero.

On a conflict, read the stages with `git show :1:<path>` (common ancestor),
`:2:<path>`, and `:3:<path>`, and keep both sides' intent. During a rebase
`--ours` (stage 2) is the base and `--theirs` (stage 3) is the commit being
replayed, the reverse of a merge. Never take a side whole and never
`git rebase --skip`. When the code and its history do not decide a conflict,
ask the user. Stage each resolved file and continue with
`GIT_EDITOR=true git rebase --continue`.

## 6. Re-run checks and compare

Re-run every check from step 4 the same way. A check that passed at baseline
and fails now stops the run, as does an undecided conflict. Nothing reaches the
remote while either stands.

## 7. Publish with an explicit lease

With a recorded lease:

```bash
git push --force-with-lease=<push-branch>:<lease> <push-remote> <branch>:<push-branch>
```

With `LEASE=none`, use `git push -u <push-remote> <branch>`, which git rejects
unless it fast-forwards any remote branch of that name. Never use a bare
`--force`. A lease rejection means the remote moved since step 3: stop
and report it without retrying. After a successful push, confirm
`git ls-remote <push-remote> refs/heads/<push-branch>` prints the local
`HEAD`.

## 8. Report

Use this shape, every line present:

```text
Base: <base-remote>/<base> (from PR <n> | default branch)
Replayed: <count> commits, <recovery-short> -> <new-head-short>
Conflicts: none | <path>: <how both intents were kept>, one line each
Checks: <command>: before <pass|fail>, after <pass|fail>, one line each
Push: pushed with lease <lease-short> | first push | not pushed: <reason>
Recovery: git reset --hard <recovery>
```
