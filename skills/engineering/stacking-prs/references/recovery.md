# Recovery

"Rerun once" is the bound: a second failure stops the run. Any other
command's non-zero exit stops the run with its stderr.

## Script exits

| Exit | Meaning                                                                                                                                                                                                                                                                                        | Action                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Pass                                                                                                                                                                                                                                                                                           | Continue.                                                                                                                                                                                 |
| 1    | A git or `gh` command failed (a `git merge --ff-only` that uncommitted edits refuse included), `gh` printed no JSON, a name failed the allowlist, a query page filled, `<remote>/<trunk>` is missing, or `view --json` disagrees with GitHub. A Stacks REST API 404 means stacked PRs are off. | Stop with stderr. A refused `git merge --ff-only`: commit or stash the edits, then rerun once. A disagreement in `check`: rerun `check` once. A 404: act as on `gh stack` exit 9.         |
| 2    | Wrong arguments, a `--remote` that names no remote, a named branch missing locally, no `<remote>/<trunk>` in named mode, or an unreadable record                                                                                                                                               | Fix the call from the script header, then rerun once.                                                                                                                                     |
| 3    | `check`: another worktree holds a layer, another author's PR, a closed or queued PR, or a branch with two open PRs                                                                                                                                                                             | Stop and report each message below.                                                                                                                                                       |
| 4    | `check`: a diverged layer has remote commits with no local copy                                                                                                                                                                                                                                | Stop and ask the user how to bring those commits in. After an earlier run rewrote a lower layer and did not push, the listing can show old copies of its commits: say so in the question. |
| 5    | `compare`: a recorded tip, PR, PR state, merged layer's local tip, or the GitHub stack changed, or a new layer appeared                                                                                                                                                                        | Stop and report each change. Nothing was pushed.                                                                                                                                          |
| 6    | `after-submit`: an active layer has no open PR                                                                                                                                                                                                                                                 | Run a new `check`, its `compare`, one more `submit`, then `after-submit`. A second exit 6 stops the run.                                                                                  |
| 7    | `repo`: several remotes and no usable `remote.pushDefault`, or one that names no remote                                                                                                                                                                                                        | Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun `repo` once.                                                                                       |
| 8    | `repo`, `check`: no remote, a URL or `pushurl` that names no GitHub repository, or a source that names another one                                                                                                                                                                             | Stop and report the message, which names both repositories and the fix.                                                                                                                   |
| 9    | `after-submit`: the top PR is in no GitHub stack, or that stack lacks, adds, or reorders PRs                                                                                                                                                                                                   | Stop, with no retry and no PR text rewrite. Report submit's stderr and each draft that still holds generated text: the PR of each layer the record holds with no PR.                      |

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

## gh stack exits

| Exit | Meaning                 | Action                                                                                                                                                                                                                                                                                                                                               |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Generic error           | "run `gh stack sync` ... before publishing" from `push` or `submit`: GitHub retargeted the stack, so see Retargeted base. A stop that names `--accept-base-change` goes to the user. "multiple remotes configured": rerun `repo`, act on its exit 7, then rerun once. A dirty or busy worktree owner: stop and name the path. Else stop with stderr. |
| 2    | Not in a stack          | From `init` without `--base`: rerun once with `--base <trunk>`. From the split's `view --json` test: the pass. Else `gh stack checkout <layer>`, then rerun once.                                                                                                                                                                                    |
| 3    | Rebase conflict         | After `rebase`: resolve as Rebase conflicts says, `git add -- <paths>`, then `gh stack rebase --continue`. Intent unclear: `gh stack rebase --abort` and ask.                                                                                                                                                                                        |
| 4    | GitHub API failure      | Run `gh auth status`, rerun once, then stop.                                                                                                                                                                                                                                                                                                         |
| 5    | Invalid arguments       | `add` below the top: `gh stack top`, then `add`. A name a stack holds with no local branch: pick another, rerun once. From `init`: the cleanup in Build first. Another worktree named as owner: stop and name the path. Else fix the call from `--help`.                                                                                             |
| 6    | Disambiguation          | Usually the trunk: `gh stack checkout <layer>`, then rerun once. From the split's `view --json` test: stop.                                                                                                                                                                                                                                          |
| 7    | Rebase in progress      | Finish it with `gh stack rebase --continue` or `gh stack rebase --abort`.                                                                                                                                                                                                                                                                            |
| 8    | Stack file locked       | Wait 5 seconds, rerun once, then stop. Never delete lock files.                                                                                                                                                                                                                                                                                      |
| 9    | Stacked PRs unavailable | Stop and tell the user.                                                                                                                                                                                                                                                                                                                              |

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
