# Recovery

## Contents

- [Script exits](#script-exits)
- [gh stack exits](#gh-stack-exits)
- [Sync aborted](#sync-aborted)
- [Rebase conflicts](#rebase-conflicts)
- [Diverged layers](#diverged-layers)
- [Squash merges](#squash-merges)
- [Retargeted base](#retargeted-base)
- [Restructuring](#restructuring)

"Rerun once" is the bound: a second failure stops the run. Any other
command's non-zero exit stops the run with its stderr.

## Script exits

| Exit | Meaning                                                                                                                                                                                                                                                                                        | Action                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Pass                                                                                                                                                                                                                                                                                           | Continue.                                                                                                                                                                                                                           |
| 1    | A git or `gh` command failed (a `git merge --ff-only` that uncommitted edits refuse included), `gh` printed no JSON, a name failed the allowlist, a query page filled, `<remote>/<trunk>` is missing, or `view --json` disagrees with GitHub. A Stacks REST API 404 means stacked PRs are off. | Stop with stderr. A refused `git merge --ff-only`: commit or stash the edits, then rerun once. A disagreement in `check`: rerun `check` once. A 404: act as on `gh stack` exit 9.                                                   |
| 2    | Wrong arguments, a `--remote` that names no remote, a named branch missing locally, no `<remote>/<trunk>` in named mode, or an unreadable record                                                                                                                                               | Fix the call from the script header, then rerun once.                                                                                                                                                                               |
| 3    | `check`: another worktree holds a layer, another author's PR, a closed or queued PR, or a branch with two open PRs. With `--restructure`: a PR on the GitHub stack that no layer holds                                                                                                         | Stop and report each message below.                                                                                                                                                                                                 |
| 4    | `check`: a diverged layer has remote commits with no local copy                                                                                                                                                                                                                                | Stop and ask the user how to bring those commits in. After an earlier run rewrote a lower layer and did not push, the listing can show old copies of its commits: say so in the question.                                           |
| 5    | `compare`: a recorded tip, PR, PR state, merged layer's local tip, or the GitHub stack changed, or a new layer appeared                                                                                                                                                                        | Stop and report each change. Nothing was pushed.                                                                                                                                                                                    |
| 6    | `after-sync`: an active layer's local and remote tips differ. `after-submit`: an active layer has no open PR                                                                                                                                                                                   | After `sync`: run `compare` with the old record, one `gh stack push --remote <remote>`, then `after-sync`. After `submit`: run a new `check`, its `compare`, one more `submit`, then `after-submit`. A second exit 6 stops the run. |
| 7    | `repo`: several remotes and no usable `remote.pushDefault`, or one that names no remote                                                                                                                                                                                                        | Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun `repo` once.                                                                                                                                 |
| 8    | `repo`, `check`: no remote, a URL or `pushurl` that names no GitHub repository, or a source that names another one                                                                                                                                                                             | Stop and report the message, which names both repositories and the fix.                                                                                                                                                             |
| 9    | `after-sync`: a recorded `REMOTE_ONLY` branch is not a layer, because `sync` did not pull its PR. `after-submit`: the top PR is in no GitHub stack, or that stack lacks, adds, or reorders PRs                                                                                                 | Stop, with no retry. After `sync`: report the message below. After `submit`: no PR text rewrite. Report submit's stderr and each draft that still holds generated text: the PR of each layer the record holds with no PR.           |

Exit 3 messages, each a stop:

- "PR #`<n>` (`<branch>`) is by `<login>`. This skill changes and publishes
  only your own PRs."
- "PR #`<n>` on `<branch>` is closed. Reopen it, or put the work on a new
  branch name (for a stack layer, through restructuring)."
- "`<branch>` has open PRs #`<n>` and #`<m>`. Close one, then rerun."
- "PR #`<n>` is in the merge queue. Rerun after it merges or leaves the
  queue."
- "`<branch>` is checked out in `<path>`, which another session can use.
  Switch that worktree to another branch, then rerun."
- "The GitHub stack has PRs the local stack lacks: #`<m>`. `gh stack unstack`
  would leave them out of the rebuilt stack. Update the stack first, then rerun
  the restructuring."

After `sync`, an exit 6 is expected when an earlier run rebased a layer and did not push: `sync` forces its push only after its own rebase, so its plain push fails and it exits 0. After `sync --prune` deleted a merged layer's branch, the retry's `compare` exits 5, an expected stop.

Exit 8 messages, each a stop:

- "Remote `<name>` names `<owner>/<repo>`, but `<remote>` names
  `<owner2>/<repo2>`. `gh stack` picks its API repository from all remotes.
  Use a clone whose remotes name one repository, or set `GH_REPO` to
  `<owner2>/<repo2>`."
- "`<remote>` fetches from `<owner>/<repo>` but pushes to `<owner2>/<repo2>`.
  `gh stack` opens PRs where it fetches. Point both URLs at one repository."
- "`gh repo set-default` names `<owner>/<repo>`, but `<remote>` names
  `<owner2>/<repo2>`. Change it with `gh repo set-default`."
- "`<remote>` (`<url>`) names no GitHub repository." or "No remote is
  configured."

Exit 9 message after `sync`, a stop:

- "GitHub's stack has PR #`<m>`, which `gh stack sync` did not pull, so it
  sits on old commits. Run `gh stack unstack --local`, `gh stack checkout <m>`,
  then `gh stack sync --remote <remote>`."

## gh stack exits

| Exit | Meaning                  | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Generic error            | "run `gh stack sync` ... before publishing" from `push` or `submit`: GitHub retargeted the stack, so see Retargeted base. A stop that names `--accept-base-change` goes to the user. "multiple remotes configured": rerun `repo`, act on its exit 7, then rerun once. From `sync`, "Cannot pull `<branch>` from the remote stack: a local branch with that name already exists": stop and name the branch, which the user renames or deletes. A dirty or busy worktree owner: stop and name the path. Else stop with stderr. |
| 2    | Not in a stack           | From `init` without `--base`: rerun once with `--base <trunk>`. From the split's `view --json` test: the pass. Else `gh stack checkout <layer>`, then rerun once.                                                                                                                                                                                                                                                                                                                                                            |
| 3    | Rebase conflict          | After `rebase`: resolve as Rebase conflicts says, `git add -- <paths>`, then `gh stack rebase --continue`. Intent unclear: `gh stack rebase --abort` and ask. After `sync`, which restored every branch and pushed nothing: reproduce the conflict with `gh stack rebase --remote <remote>`, resolve it, and continue in the change path.                                                                                                                                                                                    |
| 4    | GitHub API failure       | Run `gh auth status`, rerun once, then stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5    | Invalid arguments        | `add` below the top: `gh stack top`, then `add`. A name a stack holds with no local branch: pick another, rerun once. From `init`: the cleanup in Build first. Another worktree named as owner: stop and name the path. Else fix the call from `--help`.                                                                                                                                                                                                                                                                     |
| 6    | Disambiguation           | Usually the trunk: `gh stack checkout <layer>`, then rerun once. From the split's `view --json` test: stop.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7    | Rebase in progress       | Finish it with `gh stack rebase --continue` or `gh stack rebase --abort`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8    | Stack file locked        | Wait 5 seconds, rerun once, then stop. Never delete lock files.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9    | Stacked PRs unavailable  | Stop and tell the user.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 10   | Modify recovery required | Stop and report. `gh stack modify --abort` runs only with the user's approval, because the modify session belongs to whoever started it.                                                                                                                                                                                                                                                                                                                                                                                     |

## Sync aborted

`sync` prints `Sync aborted` and exits 0 when the local stack and GitHub's stack differ and neither extends the other. Nothing changed, so stop. The report names both stacks' PRs, each layer missing from GitHub's stack or with no PR, and the user's commands: `gh stack unstack --local`, then `gh stack checkout <n>` with `<n>` from the record's GitHub stack. Those layers then leave tracking, and their branches stay.

The skill runs neither command. The local stack can be another session's, and a PR outside GitHub's stack makes `checkout` exit 2 once tracking is gone.

## Rebase conflicts

- Read all three stages (`git show :1:<path>` is the common ancestor) and keep both sides' intent.
- During a rebase, `--ours` (stage 2) is the base and `--theirs` (stage 3) is the commit being replayed, the reverse of a merge.
- Never take a side whole, and never `git rebase --skip`.
- When the code and its history do not decide a conflict, run `gh stack rebase --abort` and ask the user.
- A layer with a resolved conflict counts as rewritten, so it and every layer above it pass their checks before publishing.

## Diverged layers

`check` lists a layer in `DIVERGED` when its remote copy and the local layer both moved, and every remote commit has a local copy or sits on `<remote>/<trunk>`. This is GitHub's rebase after a lower PR merged, or a local rebase over an old remote copy. The change path runs `gh stack rebase --remote <remote>` first.

A remote commit with no local copy makes `check` exit 4, naming each commit. Bringing it in is the user's call: never push over it.

## Squash merges

A squash merge puts one new commit on the trunk, so the merged layer's own commits stay below the layers above it. `gh stack rebase --remote <remote>` drops them. When a lower layer of two or more commits was squash-merged after a run rebased the layer above without pushing, `check` can exit 4 on those old commits. Say so when asking the user.

## Retargeted base

`push` or `submit` exits 1 with "run `gh stack sync` ... before publishing" when GitHub retargeted the stack. Run `gh stack rebase --remote <remote>`. Every active layer then counts as rewritten and passes its checks before the next push. A stop that names `--accept-base-change` goes to the user, because that flag drops the old base's commits.

## Restructuring

Restructuring splits, joins, or drops layers, or moves a closed PR's work to a new branch name. Run it only with the user's approval of the new layer plan, and only when the request covers publishing, because it republishes the stack. Layers with PRs keep their order.

- A plan that reorders layers with PRs stops before any command. Reordering is the user's, with `gh stack modify`, because `submit` pushes reordered tips before it fixes reversed PR bases.
- A plan of one layer stops before `unstack`, with one PR from that branch as next, because `submit` forms no stack below two PRs.

1. Read `trunk` from `gh stack view --json`. Run the new-name test on every new name.
2. Run `check --remote <remote> --restructure <layer>...` before `unstack`, which changes GitHub. Name each layer whose closed PR the plan moves to a new name, or none. A closed PR there does not stop `check`, and every other test runs. A PR on the GitHub stack that no layer holds exits 3, because the rebuilt stack would lack it. Exit 0 continues. On any non-zero exit, act as Script exits says, and run no `unstack`.
3. Run `GH_FORCE_TTY= GH_STACK_NO_ATOMIC= gh stack unstack > <out-file>`. It removes the stack from local tracking and unstacks it on GitHub. Branches and PRs stay, and merged or queued PRs stay stacked.
4. Rebuild the layers bottom to top: `git rebase --onto <new-base> <old-base> <layer>` for a moved layer, and a new branch from the layer below for a new one. Each new or rewritten layer, and every layer above it, passes its checks.
5. Run `gh stack init --base <trunk> <layer-1> ... <layer-n>`, bottom to top.
6. Publish as `SKILL.md` says: `check --remote <remote>`, `compare <record>`, `gh stack submit --auto --remote <remote>`, `after-submit <record>`, then `gh pr edit` for each new PR's title and body.
