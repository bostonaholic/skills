# Recovery

"Rerun once" is the bound: a second failure stops the run. Any other
command's non-zero exit stops the run with its stderr.

## Script exits

| Exit | Meaning                                                                                           | Action                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0    | Pass                                                                                              | Continue.                                                                                           |
| 1    | A git or `gh` command failed, `gh` printed no JSON, or a name failed the allowlist                | Stop with stderr.                                                                                   |
| 2    | Wrong arguments                                                                                   | Fix the call from the script header, then rerun once.                                               |
| 7    | Several remotes and no usable `remote.pushDefault`, or one that names no remote                   | Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun `repo` once. |
| 8    | No remote, a URL or `pushurl` that names no GitHub repository, or a source that names another one | Stop and report the message, which names both repositories and the fix.                             |

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

| Exit | Meaning           | Action                                                                                                                                                                                                                                                   |
| ---- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Generic error     | A dirty or busy worktree owner: stop and name the path. Else stop with stderr.                                                                                                                                                                           |
| 2    | Not in a stack    | From `init` without `--base`: rerun once with `--base <trunk>`. Else `gh stack checkout <layer>`, then rerun once.                                                                                                                                       |
| 5    | Invalid arguments | `add` below the top: `gh stack top`, then `add`. A name a stack holds with no local branch: pick another, rerun once. From `init`: the cleanup in Build first. Another worktree named as owner: stop and name the path. Else fix the call from `--help`. |
| 6    | Disambiguation    | Usually the trunk: `gh stack checkout <layer>`, then rerun once.                                                                                                                                                                                         |
| 8    | Stack file locked | Wait 5 seconds, rerun once, then stop. Never delete lock files.                                                                                                                                                                                          |
