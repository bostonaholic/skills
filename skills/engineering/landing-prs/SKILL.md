---
name: landing-prs
description: Lands a reviewed pull request by running the project's declared pre-merge steps, pushing, waiting for green CI, and squash-merging. Use when the user explicitly asks to land, ship, or merge a reviewed PR. Never infer from approval, green CI, or completion. Not for rebasing a behind branch; use rebasing-branches.
effort: medium
argument-hint: "[<pr-number>]"
---

# Landing PRs

Lands one open PR: the project's pre-merge steps, push, CI wait, squash-merge.
The PR title becomes the commit subject. No versioning, changelog, release, or
tracker work beyond what the project declares as a pre-merge step; ticket
completion comes from the PR body's `Closes #<n>`.

`gh pr merge` is irreversible. Run only on a direct "ship it", "land the PR",
or `/landing-prs`; an approved, green, or finished-looking PR is not ship
intent. Once the CI gate below passes, merge without asking again.

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
`<owner>/<repo>`; otherwise stop.

If the project's agent instructions declare a step to run before merging (for
example, a version bump), run it now. If it stops, stop.

Then `git push`. Never force-push from this skill. If the push is rejected,
report git's message verbatim; after a local rebase, end with
`Next: /rebasing-branches <n>, then /landing-prs <n>`.

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
     `0` means merge; above `0` means stop as for `BEHIND`.
   - `UNSTABLE`: watch once more; a second `UNSTABLE` on the same head is a
     failure.
   - `BEHIND`: stop and end with
     `Next: /rebasing-branches <n>, then /landing-prs <n>`. Do not call it;
     it is user-invoked only.
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
