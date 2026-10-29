# Existing work

## Split an existing change

Splitting always rebuilds the layers from a backup branch. It never changes `<branch>` or its PR.

When the change sits on a branch `<branch>` other than `<trunk>`, test it first:

1. Run named-mode `check --remote <remote> --trunk <trunk> <branch>`. It fast-forwards a behind `<branch>`, so the split holds the remote's commits. Exit 3 or 4: recovery. A non-empty `STACKED` stops the run: "PR #`<n>` is already in stack #`<s>`. Change that stack instead."
2. From `<branch>`, `GH_FORCE_TTY= GH_STACK_NO_ATOMIC= gh stack view --json > <out-file>` must exit 2, so no local stack holds it. Any other exit stops the run: "`<branch>` is already in a local stack. Change that stack instead."

Then every name the run creates, the backup included, passes the new-name test.

1. Backup. With uncommitted work, run `git switch -c <topic>-unsplit`, `git add -A`, and `git commit -F <message-file>`. A committed branch is its own backup. Never push the backup.
2. `git branch <layer-1> "$(git merge-base <remote>/<trunk> <backup>)"`, then `gh stack init --base <trunk> <layer-1>`. Layer 1 starts at the merge-base, so step 4 is exact.
3. Per layer, bottom to top: `git restore --source=<backup> -- <paths>`, cut mixed files down to this layer's part, run its checks, `git add -- <paths>`, and `git commit -F <message-file>`. Below the top, `gh stack add <next>` and the tip test.
4. On the top layer, `git diff --quiet <backup> HEAD` must exit 0 before anything is published. Exit 1 means the layers differ from the backup: stop and report.
5. If `<remote>/<trunk>` moved, run `gh stack rebase --remote <remote>`, then the checks again.
6. Publish as `SKILL.md` says. The new layers have no PRs, so `check` records each `absent`.

An old PR on the backup stays open, and the report says the stack replaces it. Closing it and deleting the backup are the user's calls. After a later stop, the report names the backup, each layer, and its tracking. Layers merged down to one end the split with one PR as next.

## Overlap with the same author's open PR

New work that changes a path the same author's open PR also changes is built as local layers on that PR's branch. This path runs no `gh stack` mutation, no push, and no `check`, whatever the request says. Nothing leaves the clone.

1. Overlap: a path in both changes, from the `gh pr list` output in Decide. When the work overlaps two open PRs on separate branches, do not stack: tell the user and stop.
2. The PR's `headRefName` enters a command only when it matches `^[A-Za-z0-9._/-]+$` and starts with no `-`. Otherwise stop and report it.
3. Build:
   1. `git fetch --prune <remote> '+refs/heads/*:refs/remotes/<remote>/*'`, then the new-name test on every new layer name.
   2. `<build-base>` is the SHA that `git rev-parse <remote>/<its-branch>` prints, where `<its-branch>` is the PR's `headRefName`.
   3. `git switch --no-track -c <new-1> <build-base>`.
   4. Per layer: edit, run its checks, `git add -- <paths>`, and `git commit -F <message-file>`. Then `git switch --no-track -c <new-k>` for the next layer. Layer 1's empty-layer count uses `<build-base>` below it.
4. Report each new branch bottom to top, `<build-base>`, the checks run, and PR `#<n>` with its base. The next step is the user's: once `#<n>` merges or closes, ask "Publish the layers `<new-1>` to `<new-last>` built on `<build-base>`". Add "onto `<its-base>`" when the PR's base is not `DEFAULT`.

`--no-track` gives each new branch no upstream, so a later plain `git push` has no target.

## Publish layers built on an open PR

A later request to publish layers built on `<build-base>` is a split. A request that names no `<build-base>` stops and asks for it. `<trunk>` is the base the request names, else `DEFAULT`.

1. Run the split's tests above on `<new-last>`.
2. `git merge-base --is-ancestor <build-base> <new-last>` must exit 0. Else stop and report.
3. Replay only the new layers, after the new-name test on `<topic>-unsplit`: `git switch --no-track -c <topic>-unsplit <new-last>`, then `git rebase --onto <remote>/<trunk> <build-base>`. On a conflict, run `git rebase --abort` and stop: "`<new-last>` conflicts with `<remote>/<trunk>`. Rebase it yourself, then ask to split it."
4. Decide on `<topic>-unsplit`. An open #`<n>` that still overlaps stops it with the split's overlap message. One PR ends the run, and the report names `<topic>-unsplit` as that PR's branch. Otherwise continue the split at step 2, with `<topic>-unsplit` as the backup.

The replay holds only `<build-base>..<new-last>`. A squash merge leaves #`<n>`'s commits off the trunk, and a rewrite of #`<n>` after the build leaves its old commits under `<new-1>`, so a split from the merge-base would publish both.
