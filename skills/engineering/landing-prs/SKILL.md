---
name: landing-prs
description: Lands a reviewed pull request by running the project's declared pre-merge steps, pushing, waiting for green CI, and squash-merging. Use when the user explicitly asks to land, ship, or merge a reviewed PR. Never infer from approval, green CI, or completion. Not for rebasing a behind branch; use rebasing-branches.
effort: medium
argument-hint: "[<pr-number>]"
---

# landing-prs: land a reviewed PR

Lands one open PR: the project's pre-merge steps, push, CI wait, squash-merge.
The PR title becomes the commit subject in `git log`. The skill does no
versioning, changelog, release, tracker, or board work: a project that versions
at land time declares that as a pre-merge step, and ticket completion comes from
the PR body's `Closes #<n>`.

`gh pr merge` is irreversible. Two guards protect it:

1. **Explicit ship intent.** Run only on a direct "ship it", "land the PR", or
   `/landing-prs`. An approved, green, or finished-looking PR is not ship
   intent. This applies the [human control rules](shared/human-control.md);
   read them before step 1.
2. **Green CI** (step 5) gates the merge mechanically: a red, pending, or
   timed-out check stops the land before `gh pr merge` runs.

Do not ask the user to confirm the merge. Once step 5 passes, merge.

Read each linked file from this skill's directory when the step that uses it begins. If a read fails, stop that step and report the exact path.

Copy this checklist and check off each step:

```text
- [ ] 1. Preflight and resolve the PR
- [ ] 2. Check that squash merging is allowed
- [ ] 3. Run the project's pre-merge steps
- [ ] 4. Push
- [ ] 5. Wait for CI: settle, watch, verify
- [ ] 6. Squash-merge
- [ ] 7. Re-query and report
```

## 1. Preflight and resolve the PR

```bash
command -v gh >/dev/null && command -v git >/dev/null && gh auth status
```

If gh is missing or not authenticated, stop and tell the user to install it or
run `gh auth login`.

The optional `<pr-number>` argument selects the PR; without it, use the current
branch's PR. Refuse an argument that is not all digits. Then:

```bash
gh pr view <pr-number> --json number,state,title,headRefName,baseRefName,isCrossRepository,url
git branch --show-current
```

Omit `<pr-number>` when no argument was given. Use the returned `number` as
`<pr-number>` from here on, and split `url`
(`https://<host>/<owner>/<repo>/pull/<n>`) into `<host>`, `<owner>`, and
`<repo>` for step 5c.

- **No PR found:** stop. This skill lands an existing PR; tell the user to open
  one first.
- **`state` is `MERGED` or `CLOSED`:** stop before doing any work.
- **`isCrossRepository` is `true`:** stop. The head branch lives in a fork,
  which step 4's push does not reach.
- **`baseRefName` falls outside `^[A-Za-z0-9._/-]+$`:** stop and report it.
  Step 5c puts it in a command.
- **`headRefName` is not the current branch, or the current branch is
  `baseRefName`:** stop and tell the user to run `gh pr checkout <pr-number>`
  and re-run. Steps 3 and 4 act on the local checkout.

Then confirm that a plain `git push` updates the PR's head branch:

```bash
remote=$(git for-each-ref --format='%(push:remotename)' "refs/heads/$(git branch --show-current)")
echo "REMOTE=$remote PUSH=$(git rev-parse --abbrev-ref '@{push}') URL=$(git remote get-url "$remote")"
```

`PUSH` must be `<REMOTE>/<headRefName>`, and `URL` must end in
`<owner>/<repo>` or `<owner>/<repo>.git`. Otherwise, or if either command
fails, stop: step 4 would push somewhere other than the PR. Tell the user to
run `gh pr checkout <pr-number>` and re-run.

## 2. Check that squash merging is allowed

```bash
gh repo view --json squashMergeAllowed --jq .squashMergeAllowed
```

Stop and report only if it prints `false`. Other enabled merge methods do not
matter.

## 3. Run the project's pre-merge steps

If the project's agent instructions declare a step to run before merging (for
example, a version bump), run it now. If that step stops, stop: do not push,
wait for CI, or merge. With no declared step, continue.

## 4. Push

Push so CI runs against what will land:

```bash
git push
```

If the push is rejected, stop and report git's message verbatim. Never
force-push from this skill. When the branch was rebased locally, end with
`Next: /rebasing-branches <pr-number>, then /landing-prs <pr-number>`;
rebasing-branches publishes the rewrite with an explicit lease.

## 5. Wait for CI: settle, watch, verify

The watch is not the verdict: `gh pr checks --watch` exits when nothing is
pending right now, including before a push's checks attach or a gated job
spawns. The verdict comes from GitHub's aggregate in 5c.

**5a. Settle.** Let the push's workflows register. Run this inline; it is the
short-wait exception in the [execution rules](shared/execution.md). Six polls
10 seconds apart give GitHub one minute to attach checks:

```bash
for _ in 1 2 3 4 5 6; do
  STATE=$(gh pr view <pr-number> --json mergeStateStatus --jq .mergeStateStatus)
  COUNT=$(gh pr view <pr-number> --json statusCheckRollup --jq '.statusCheckRollup | length')
  [ "$STATE" != "UNKNOWN" ] && [ "${COUNT:-0}" -gt 0 ] && break
  sleep 10
done
echo "STATE=$STATE COUNT=$COUNT"
```

`COUNT=0` after the loop means the repo has no CI for this PR. That is not a
failure: skip 5b and let 5c decide.

**5b. Watch.** Bounded, never infinite. `--fail-fast` exits on the first failed
check; the 1800-second (30-minute) cap bounds a hung or queued suite; the
30-second interval keeps API calls low. `timeout` is not installed on stock
macOS, so use `gtimeout` when that is what exists:

```bash
if TO=$(command -v timeout || command -v gtimeout); then
  "$TO" 1800 gh pr checks <pr-number> --watch --fail-fast --interval 30
else
  gh pr checks <pr-number> --watch --fail-fast --interval 30
fi
echo "WATCH_STATUS=$?"
```

Run it with `run_in_background: true`; a foreground call dies at the harness
ceiling described in the [execution rules](shared/execution.md). With neither
`timeout` nor `gtimeout`, enforce the cap yourself: if the background task has
not exited after 30 minutes, stop it and treat the result as `124`.

Map `WATCH_STATUS`:

- **0:** necessary, not sufficient. Continue to 5c.
- **124:** the cap was hit before CI went green. Stop and report "CI wait timed
  out". Do not merge.
- **127:** a required command is missing. Stop and report which one; this is
  not a check failure.
- **143:** the harness killed a foreground watch. Re-run 5b in the background.
- **any other value:** a check failed. Run `gh pr checks <pr-number>`, report
  the failing check by name, and stop. Leave the branch in place; the user
  fixes CI and re-runs `/landing-prs`, which is safe to re-run.

When reporting the watch, do not present a green check count as confidence in
the tests behind it; read the
[value bar in the test quality policy](shared/testing.md#value-bar) before
writing that report.

**5c. Verify. This is the gate.**

```bash
gh pr view <pr-number> --json mergeStateStatus,headRefOid --jq '.mergeStateStatus + " " + .headRefOid'
```

- **`CLEAN` or `HAS_HOOKS`:** CI is green. GitHub reports `BEHIND` only when
  branch protection requires up-to-date branches, so check the base yourself
  before merging. `<head-oid>` is the printed `headRefOid`, and the count is
  the base's commits missing from it:

  ```bash
  gh api --hostname <host> 'repos/<owner>/<repo>/compare/<baseRefName>...<head-oid>' --jq .behind_by
  ```

  `0`: keep `<head-oid>` for step 6 and merge. Above `0`: stop as
  for `BEHIND`. A failed call: stop and report gh's message.

- **`UNSTABLE`:** a suite is still running, or a check failed. Repeat 5b once.
  A second `UNSTABLE` on the same head is a failure, not a race: print
  `gh pr checks <pr-number>` and stop.
- **`BEHIND`:** the base moved. Stop and end with
  `Next: /rebasing-branches <pr-number>, then /landing-prs <pr-number>`.
  rebasing-branches is user-invoked only, so do not call it.
- **`UNKNOWN`:** GitHub is still computing mergeability. Re-read once; stop if
  it does not resolve.
- **anything else** (`BLOCKED`, `DIRTY`, `DRAFT`, and others): stop and report
  the status verbatim. Never merge on a status this list does not name.

## 6. Squash-merge

Squash lands the PR title as the commit subject and keeps history linear, so it
is the only merge strategy here. Read the title now, since a pre-merge step may
have retitled the PR, and append `(#<pr-number>)` yourself: an explicit
`--subject` is not auto-suffixed. `--match-head-commit` makes GitHub refuse the
merge if anything was pushed after 5c verified the head:

```bash
TITLE=$(gh pr view <pr-number> --json title --jq .title) &&
  gh pr merge <pr-number> --squash --match-head-commit <head-oid> --subject "$TITLE (#<pr-number>)"
```

Leave the squash body (by default the concatenated commit messages) as-is
unless the user asks otherwise.

- **Branch-protection rejection:** report GitHub's message verbatim. Never use
  `--admin` or any other bypass.
- **Head mismatch:** the branch moved after verification. Return to 5a once. A
  second mismatch stops the land: report that the branch keeps moving.

## 7. Re-query and report

```bash
gh pr view <pr-number> --json state,mergeCommit --jq '.state + " " + (.mergeCommit.oid // "none")'
```

Only `MERGED <oid>` confirms the land. Any other state (for example, a merge
queue still holding the PR) is reported verbatim, without claiming the PR
landed.

Report the merge commit, or the exact reason the land stopped: a failing check,
a timeout, a status from 5c, or a GitHub rejection. If the project publishes a
release on merge, it runs asynchronously: point the user at `gh run list` or
`gh run watch` rather than assume it is done.
