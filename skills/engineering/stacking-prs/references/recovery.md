# Recovery

"Rerun once" is the bound: a second failure stops the run. Any other
command's non-zero exit stops the run with its stderr.

## Script exits

| Exit | Meaning                                                                                                                                                                                                                       | Action                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Pass                                                                                                                                                                                                                          | Continue.                                                                                                                                                            |
| 1    | A git or `gh` command failed, `gh` printed no JSON, a name failed the allowlist, a query page filled, `<remote>/<trunk>` is missing, or `view --json` disagrees with GitHub. A Stacks REST API 404 means stacked PRs are off. | Stop with stderr. A disagreement in `check`: rerun `check` once. A 404: act as on `gh stack` exit 9.                                                                 |
| 2    | Wrong arguments, a `--remote` that names no remote, or an unreadable record                                                                                                                                                   | Fix the call from the script header, then rerun once.                                                                                                                |
| 3    | `check`: another author's PR, a closed or queued PR, or a branch with two open PRs                                                                                                                                            | Stop and report each message below.                                                                                                                                  |
| 4    | `check`: a layer's remote copy has commits the local layer lacks                                                                                                                                                              | Stop and ask the user how to bring those commits in.                                                                                                                 |
| 5    | `compare`: a recorded tip, PR, PR state, merged layer's local tip, or the GitHub stack changed, or a new layer appeared                                                                                                       | Stop and report each change. Nothing was pushed.                                                                                                                     |
| 6    | `after-submit`: an active layer has no open PR                                                                                                                                                                                | Run a new `check`, its `compare`, one more `submit`, then `after-submit`. A second exit 6 stops the run.                                                             |
| 7    | `repo`: several remotes and no usable `remote.pushDefault`, or one that names no remote                                                                                                                                       | Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun `repo` once.                                                                  |
| 8    | `repo`, `check`: no remote, a URL or `pushurl` that names no GitHub repository, or a source that names another one                                                                                                            | Stop and report the message, which names both repositories and the fix.                                                                                              |
| 9    | `after-submit`: the top PR is in no GitHub stack, or that stack lacks, adds, or reorders PRs                                                                                                                                  | Stop, with no retry and no PR text rewrite. Report submit's stderr and each draft that still holds generated text: the PR of each layer the record holds with no PR. |

Exit 3 messages, each a stop:

- "PR #`<n>` (`<branch>`) is by `<login>`. This skill changes and publishes
  only your own PRs."
- "PR #`<n>` on `<branch>` is closed. Reopen it, or put the work on a new
  branch name (for a stack layer, through restructuring)."
- "`<branch>` has open PRs #`<n>` and #`<m>`. Close one, then rerun."
- "PR #`<n>` is in the merge queue. Rerun after it merges or leaves the
  queue."

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

| Exit | Meaning                 | Action                                                                                                                                                                                                                                                   |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Generic error           | "multiple remotes configured": rerun `repo`, act on its exit 7, then rerun once. A dirty or busy worktree owner: stop and name the path. Else stop with stderr.                                                                                          |
| 2    | Not in a stack          | From `init` without `--base`: rerun once with `--base <trunk>`. Else `gh stack checkout <layer>`, then rerun once.                                                                                                                                       |
| 4    | GitHub API failure      | Run `gh auth status`, rerun once, then stop.                                                                                                                                                                                                             |
| 5    | Invalid arguments       | `add` below the top: `gh stack top`, then `add`. A name a stack holds with no local branch: pick another, rerun once. From `init`: the cleanup in Build first. Another worktree named as owner: stop and name the path. Else fix the call from `--help`. |
| 6    | Disambiguation          | Usually the trunk: `gh stack checkout <layer>`, then rerun once.                                                                                                                                                                                         |
| 8    | Stack file locked       | Wait 5 seconds, rerun once, then stop. Never delete lock files.                                                                                                                                                                                          |
| 9    | Stacked PRs unavailable | Stop and tell the user.                                                                                                                                                                                                                                  |
