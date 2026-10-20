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

## Before pushing

Use the argument (digits only) or the current branch's PR. Stop if there is no
PR, it is merged or closed, it is cross-repository (the head lives in a fork),
the current branch is not its `headRefName`, or the repository disallows
squash merging (`gh repo view --json squashMergeAllowed`), or its
`baseRefName` falls outside `^[A-Za-z0-9._/-]+$`. For a wrong branch, tell the
user to run `gh pr checkout <n>` and re-run. Split the PR's `url`
(`https://<host>/<owner>/<repo>/pull/<n>`) into `<host>`, `<owner>`, and
`<repo>`.

Confirm a plain `git push` updates the PR head, not some other remote or
branch:

```bash
remote=$(git for-each-ref --format='%(push:remotename)' "refs/heads/$(git branch --show-current)")
echo "PUSH=$(git rev-parse --abbrev-ref '@{push}') URL=$(git remote get-url "$remote")"
```

`PUSH` must be `<remote>/<headRefName>` and `URL` must name the PR's
`<owner>/<repo>`; otherwise stop. `<remote>` is that push remote.

### Rebase when behind

Whether to rebase is a count, never a judgment. Record the lease first, since
the fetch moves the remote-tracking ref:

```bash
lease=$(git rev-parse '@{push}') && git merge-base --is-ancestor "$lease" HEAD && echo "LEASE=$lease"
git fetch <remote> <baseRefName> && git rev-list --count HEAD..refs/remotes/<remote>/<baseRefName>
```

A failed ancestry check means the remote has commits this branch lacks; stop
and report that. A count of `0` means skip to the pre-merge steps. Above `0`,
rebase:

1. Stop if `git status --porcelain --untracked-files=no` prints anything.
2. `git rebase refs/remotes/<remote>/<baseRefName>`, adding `--rebase-merges`
   when `git rev-list --merges --count refs/remotes/<remote>/<baseRefName>..HEAD`
   is above `0`.
3. On a conflict, `git rebase --abort` and call the Skill tool with
   `rebasing-branches` and `<n>` (see [skill calls](shared/skill-calls.md)).
   It rebases again, resolves each conflict by both sides' intent, re-runs the
   project's checks, and pushes with its own lease. When it finishes pushed,
   continue; when it stops (a conflict the code and history do not decide, or
   a check that newly fails), stop and relay its report. If it is not
   installed, name the conflicting paths and end with
   `Next: /rebasing-branches <n>, then /landing-prs <n>`.

### Pre-merge steps and push

If the project's agent instructions declare a step to run before merging (for
example, a version bump), run it now. If it stops, stop.

Then push. After a rebase this skill ran itself and has not pushed,
`git push --force-with-lease=<headRefName>:<lease> <remote> HEAD:<headRefName>`;
otherwise, including after `rebasing-branches` pushed, `git push`. Never
a bare `--force`. If the push is rejected, report git's message verbatim
and stop without retrying; a lease rejection means someone else pushed to the
branch.

## CI gate

`gh pr checks --watch` exiting 0 is not the verdict: it exits when nothing is
pending right now, including before the push's checks attach or a gated job
spawns. So:

1. **Settle.** Poll `gh pr view <n> --json mergeStateStatus,statusCheckRollup`
   for up to about a minute until the status is not `UNKNOWN` and at least
   one check has attached. Zero checks after that means no CI; let step 3
   decide.
2. **Watch**, bounded: `gh pr checks <n> --watch --fail-fast --interval 30`
   in the background with a 30-minute cap (`timeout` or `gtimeout`; stock
   macOS has neither, so enforce the cap yourself and treat a hit as `124`).
   Exit `124`: stop, "CI wait timed out". `127`: a required command is
   missing; stop and name it, not a check failure. `143`: the harness killed a
   foreground watch; re-run it in the background. Any other nonzero: report
   the failing check by name and stop.
3. **Verify `mergeStateStatus` and `headRefOid`.** This is the gate.
   - `CLEAN` or `HAS_HOOKS`: still check the base, because GitHub reports
     `BEHIND` only when branch protection requires up-to-date branches:
     `gh api --hostname <host> 'repos/<owner>/<repo>/compare/<baseRefName>...<head-oid>' --jq .behind_by`.
     `0` means merge; above `0` means rebase as for `BEHIND`.
   - `UNSTABLE`: watch once more; a second `UNSTABLE` on the same head is a
     failure.
   - `BEHIND`: the base moved. Return to
     [Rebase when behind](#rebase-when-behind), push, and rerun this gate from
     Settle. After three rebases in one run, stop: "base keeps moving".
   - `UNKNOWN`: re-read once.
   - Anything else (`BLOCKED`, `DIRTY`, `DRAFT`, ...): stop and report it
     verbatim. Never merge on an unnamed status.

## Merge

Squash only. Re-read the title (a pre-merge step may have changed it) and add
the PR suffix yourself, since an explicit `--subject` is not auto-suffixed.
`--match-head-commit` refuses the merge if anything was pushed after the gate:

```bash
TITLE=$(gh pr view <n> --json title --jq .title) &&
  gh pr merge <n> --squash --match-head-commit <head-oid> --subject "$TITLE (#<n>)"
```

Never use `--admin` or any bypass; report a branch-protection rejection
verbatim. On a head mismatch, rerun the CI gate once; a second mismatch stops.

Confirm with `gh pr view <n> --json state,mergeCommit`: only `MERGED` with a
merge commit confirms the land (a merge queue may still hold it). Report the
merge commit or the exact reason the land stopped. A release triggered by the
merge runs asynchronously; point at `gh run list` rather than assume it is
done.
