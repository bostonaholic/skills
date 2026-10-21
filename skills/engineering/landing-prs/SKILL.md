---
name: landing-prs
description: Lands a reviewed pull request by rebasing onto the base when the branch is behind and resolving any conflicts, running the project's declared pre-merge steps, pushing, waiting for green CI, and squash-merging. Use when the user explicitly asks to land, ship, or merge a reviewed PR. Never infer from approval, green CI, or completion. Not for a watch that should merge on approval; use watching-authored-prs. Not for rebasing without landing; use rebasing-branches.
effort: medium
argument-hint: "[<pr-number>]"
---

# Landing PRs

`gh pr merge` is irreversible. Run only on a direct "ship it", "land the PR",
or `/landing-prs`; an approved, green, or finished-looking PR is not ship
intent. That request also authorizes the rebase and the lease-guarded
force-push a behind branch needs; never stop to hand either back to the user.
Once the CI gate below passes, merge without asking again.

The scripts live in `<skill-dir>/scripts/` and run from the repository, on the
PR's head branch.

## Before pushing

Run `"<skill-dir>/scripts/preflight.sh" [<n>]`, passing the argument (digits
only) when the user gave one. On exit 0 use its `KEY=VALUE` lines below. Any
other exit: stop and report its stderr. For exit 4 on a wrong branch, tell the
user to run `gh pr checkout <n>` and re-run.

### Rebase when behind

Rebase only when `BEHIND` is above `0`:

1. `git rebase refs/remotes/<REMOTE>/<BASE_REF>`, adding `--rebase-merges`
   when `MERGES` is above `0`.
2. On a conflict, `git rebase --abort` and call the Skill tool with
   `rebasing-branches` and `<n>` (see [skill calls](shared/skill-calls.md)).
   When it finishes pushed, continue; when it stops, stop and relay its
   report. If it is not installed, name the conflicting paths and end with
   `Next: /rebasing-branches <n>, then /landing-prs <n>`.

### Pre-merge steps and push

If the project's agent instructions declare a step to run before merging (for
example, a version bump), run it now. If it stops, stop.

Then push. After a rebase this skill ran itself and has not pushed,
`git push --force-with-lease=<HEAD_REF>:<LEASE> <REMOTE> HEAD:<HEAD_REF>`;
otherwise, including after `rebasing-branches` pushed, `git push`. Never
a bare `--force`. If the push is rejected, report git's message verbatim
and stop without retrying.

## CI gate

Run `node "<skill-dir>/scripts/ci-gate.mjs" <URL>` in the background and act on its
exit code:

- `0` (`merge`): go to Merge with its `HEAD`.
- `10` (`rebase`): re-run [Before pushing](#before-pushing), rebase, push,
  and re-run the gate. After three rebases in one run, stop: "base keeps
  moving".
- `1` (`fail`), `11` (`unstable`), `124` (`timeout`): stop with the verdict,
  naming each `FAILED` check.
- `3` (`stop`): stop and report `STATUS` verbatim (`BLOCKED`, `DIRTY`,
  `DRAFT`, ...). Never merge on an unnamed status.
- `143`: the harness killed it; re-run it in the background.
- Anything else: stop and report its stderr (`127`: a missing command, not a
  check failure).

## Merge

Run `"<skill-dir>/scripts/merge.sh" <URL> <HEAD>`.

- `0`: report the `MERGED` commit.
- `3`: the head moved after the gate. Re-run the CI gate once; a second `3`
  stops.
- `5`: not merged yet (merge queue or auto-merge); report that.
- Anything else, including a branch-protection rejection (`4`): report its
  stderr verbatim and stop. Never use `--admin` or any bypass.

Point at `gh run list` for any release the merge triggers; do not assume it is
done.
