---
name: landing-prs
description: Lands a reviewed pull request by rebasing onto the base when the branch is behind and resolving any conflicts, running the project's declared pre-merge steps, pushing, waiting for green CI, and squash-merging. Use when the user explicitly asks to land, ship, or merge a reviewed PR. Never infer from approval, green CI, or completion. Not for a watch that should merge on approval; use watching-authored-prs. Not for rebasing without landing; use rebasing-branches.
effort: medium
argument-hint: "[<pr-number>]"
---

# Landing PRs

Lands one open PR: rebase if behind, the project's pre-merge steps, push, CI
wait, squash-merge.
The PR title becomes the commit subject. No versioning, changelog, release, or
tracker work beyond what the project declares as a pre-merge step; ticket
completion comes from the PR body's `Closes #<n>`.

`gh pr merge` is irreversible. Run only on a direct "ship it", "land the PR",
or `/landing-prs`; an approved, green, or finished-looking PR is not ship
intent. That request also authorizes the rebase and the lease-guarded
force-push a behind branch needs; never stop to hand either back to the user.
Once the CI gate below passes, merge without asking again.

The scripts live in `<skill-dir>/scripts/` and run from the repository, on the
PR's head branch. Each script's header documents its checks, output, and exit
codes.

## Before pushing

Run `"<skill-dir>/scripts/preflight.sh" [<n>]`, passing the argument (digits
only) when the user gave one. On exit 0 it prints `PR`, `URL`, `HOST`,
`OWNER`, `REPO`, `HEAD_REF`, `BASE_REF`, `REMOTE`, `LEASE`, `BEHIND`, and
`MERGES`; use those values below. Any other exit: stop and report its stderr.
For exit 4 on a wrong branch, tell the user to run `gh pr checkout <n>` and
re-run.

### Rebase when behind

Whether to rebase is the `BEHIND` count, never a judgment. `0` means skip to
the pre-merge steps. Above `0`, rebase:

1. `git rebase refs/remotes/<REMOTE>/<BASE_REF>`, adding `--rebase-merges`
   when `MERGES` is above `0`.
2. On a conflict, `git rebase --abort` and call the Skill tool with
   `rebasing-branches` and `<n>` (see [skill calls](shared/skill-calls.md)).
   It rebases again, resolves each conflict by both sides' intent, re-runs the
   project's checks, and pushes with its own lease. When it finishes pushed,
   continue; when it stops (a conflict the code and history do not decide, or
   a check that newly fails), stop and relay its report. If it is not
   installed, name the conflicting paths and end with
   `Next: /rebasing-branches <n>, then /landing-prs <n>`.

### Pre-merge steps and push

If the project's agent instructions declare a step to run before merging (for
example, a version bump), run it now. If it stops, stop. Which steps a project
declares, and whether one passed, is read from prose, so it stays with you.

Then push. After a rebase this skill ran itself and has not pushed,
`git push --force-with-lease=<HEAD_REF>:<LEASE> <REMOTE> HEAD:<HEAD_REF>`;
otherwise, including after `rebasing-branches` pushed, `git push`. Never
a bare `--force`. If the push is rejected, report git's message verbatim
and stop without retrying; a lease rejection means someone else pushed to the
branch.

## CI gate

Run `node "<skill-dir>/scripts/ci-gate.mjs" <URL>` in the background: it waits
up to 30 minutes for CI. It prints `VERDICT=`, then `STATUS=`, `HEAD=`,
`BEHIND_BY=`, and `FAILED=` lines when known. Act on its exit code:

- `0` (`merge`): go to Merge with its `HEAD`.
- `10` (`rebase`): the base moved. Re-run
  [Before pushing](#before-pushing), rebase, push, and re-run the gate. After
  three rebases in one run, stop: "base keeps moving".
- `1` (`fail`): stop and name each `FAILED` check.
- `11` (`unstable`): stop; the PR stayed `UNSTABLE` after a second watch.
- `124` (`timeout`): stop, "CI wait timed out".
- `3` (`stop`): stop and report `STATUS` verbatim (`BLOCKED`, `DIRTY`,
  `DRAFT`, ...). Never merge on an unnamed status.
- `143`: the harness killed it; re-run it in the background.
- Anything else: stop and report its stderr; for `127`, name the missing
  command, which is not a check failure.

## Merge

Run `"<skill-dir>/scripts/merge.sh" <URL> <HEAD>`. It squash-merges only if
the head is still `HEAD`, with the current title plus ` (#<n>)` as the
subject, then confirms the merge.

- `0`: report the `MERGED` commit.
- `3`: the head moved after the gate. Re-run the CI gate once; a second `3`
  stops.
- `5`: not merged yet (a merge queue or auto-merge may hold it); report that.
- Anything else, including a branch-protection rejection (`4`): report its
  stderr verbatim and stop. Never use `--admin` or any bypass.

A release triggered by the merge runs asynchronously; point at `gh run list`
rather than assume it is done.
