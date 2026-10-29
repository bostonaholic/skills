# Existing work

## Overlap with the same author's open PR

New work that changes a path the same author's open PR also changes is built as local layers on that PR's branch. This path runs no `gh stack` mutation, no push, and no `check`, whatever the request says. Nothing leaves the clone.

1. Overlap: a path in both changes, from the `gh pr list` output in Decide. When the work overlaps two open PRs on separate branches, do not stack: tell the user and stop.
2. The PR's `headRefName` enters a command only when it matches `^[A-Za-z0-9._/-]+$` and starts with no `-`. Otherwise stop and report it.
3. Build:
   1. `git fetch <remote>`, then the new-name test on every new layer name.
   2. `<build-base>` is the SHA that `git rev-parse <remote>/<its-branch>` prints, where `<its-branch>` is the PR's `headRefName`.
   3. `git switch --no-track -c <new-1> <build-base>`.
   4. Per layer: edit, run its checks, `git add -- <paths>`, and `git commit -F <message-file>`. Then `git switch --no-track -c <new-k>` for the next layer. Layer 1's empty-layer count uses `<build-base>` below it.
4. Report each new branch bottom to top, `<build-base>`, the checks run, and PR `#<n>` with its base. The next step is the user's: once `#<n>` merges or closes, ask "Publish the layers `<new-1>` to `<new-last>` built on `<build-base>`". Add "onto `<its-base>`" when the PR's base is not `DEFAULT`.

`--no-track` gives each new branch no upstream, so a later plain `git push` has no target.
