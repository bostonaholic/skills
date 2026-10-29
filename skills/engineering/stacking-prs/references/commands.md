# gh stack commands

## Contents

- [Version](#version)
- [Rules for every command](#rules-for-every-command)
- [Safe forms](#safe-forms)
- [Command notes](#command-notes)
- [PR text](#pr-text)
- [The script](#the-script)
- [Limits](#limits)

## Version

These forms were written against gh-stack v0.3.0. On a newer release,
`gh stack <command> --help` wins where it disagrees. The full reference is at
<https://gh.io/stacks>.

## Rules for every command

- Send stdout to a file and read the command's own exit status. Never pipe a
  `gh stack` command or the script: without `pipefail`,
  `gh stack <command> | tail` reports 0 when `gh stack` failed.
- Prefix every `gh stack` command with `GH_FORCE_TTY= GH_STACK_NO_ATOMIC=`.
  `gh stack` prompts when stdout is a terminal or `GH_FORCE_TTY` is not empty.
  A non-empty `GH_STACK_NO_ATOMIC` turns off atomic pushes, so a failed push
  can move some remote branches and not others. The `VAR= command` prefix sets
  each variable empty in sh, bash, and zsh.
- Keep `view --json` stdout apart from stderr, where status lines and release
  notices go.
- Pass `--repo <repo>` to every plain `gh` call, or `--hostname <host>` to
  `gh api`. A plain `gh` call without it can resolve another remote's
  repository.
- Pass `--base <trunk>` to every `init`. Without it, `init` reads only
  `refs/remotes/origin/HEAD`, then a local `main` or `master`.
- `init`, `checkout`, and `trunk` take no `--remote` and push nothing.
- Set `GH_STACK_NO_UPDATE_NOTIFIER=1` to turn off gh-stack's release check.

## Safe forms

| Run                                                                                                                                                   | Never run                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh stack view --json`, `gh stack view --short`                                                                                                       | bare `view`, a full-screen view under a terminal                                                                                                     |
| `gh stack init --base <trunk> <branch>`. Several names only when all but the last exist locally.                                                      | bare `init`, which prompts or exits 5, or `init` without `--base`                                                                                    |
| `gh stack add <branch>`                                                                                                                               | bare `add`, which prompts for a name, or `add` with `-m`, `-A`, or `-u`, which commit or stage for it                                                |
| `gh stack submit --auto --remote <remote>`                                                                                                            | bare `submit`, which opens a full-screen editor, or `submit` without `--remote`, which takes the remote from branch config                           |
| `gh stack push --remote <remote>`                                                                                                                     | `push` without `--remote`, which takes the remote from branch config                                                                                 |
| `gh stack rebase --upstack --no-trunk <layer>` for the cascade. `gh stack rebase --remote <remote>` for a catch-up, a retarget, or a `sync` conflict. | `--upstack` without `--no-trunk` after the checks ran, which rebases the bottom onto a freshly fetched trunk, or a trunk `rebase` without `--remote` |
| `gh stack checkout <target>`                                                                                                                          | bare `checkout`, which opens a picker                                                                                                                |
| `gh stack up`, `down`, `top`, `bottom`                                                                                                                | `gh stack switch`, a menu only                                                                                                                       |
| `gh pr list`, `gh pr edit`, `gh pr ready`, and `gh repo view` with `--repo <repo>`, and `gh api --hostname <host>`                                    | any plain `gh` call without the repository, which can resolve another remote's repository                                                            |
| `git commit -F <message-file>`                                                                                                                        | bare `git commit`, `git add -p`, `git add -i`, which open an editor or a prompt                                                                      |

## Command notes

- `init` and `add` adopt a local branch no stack holds, with its commits.
  `init` creates a missing name from the local trunk branch, or from the
  previous name, and checks out the last name.
- `init` and `add` refuse a name any stack holds, trunks included.
- `init` exits 5 when the current branch is a non-trunk layer of a stack.
- A failed `init` saves no tracking, because it writes the stack file last.
- `add` runs only from the top layer, else exit 5. On a fully merged stack,
  `add` warns, creates no branch, and exits 0, which the tip test catches.
- `view --json` `head` is the SHA saved at the last `gh stack` write, not the
  live tip, so the empty-layer count uses `git rev-list`.
- Without a terminal, `init` does not turn on `rerere.enabled`.
- `checkout` and navigation exit 5 and name the owner when another worktree
  holds the target.
- `up`, `down`, `top`, and `bottom` take no `--remote` and push nothing.
- `push` does not fast-forward a layer that is behind its remote copy, and its
  lease is taken seconds before its push, so it can replace a remote commit the
  local layer lacks. `check` fast-forwards behind layers first, and `compare`
  catches commits pushed during the run.
- `rebase <layer> --upstack` starts the cascade at that layer. With
  `--no-trunk` it fetches nothing and leaves the bottom layer as it is.
- A full `gh stack rebase --remote <remote>` drops a merged layer's commits
  from the layers above it. After GitHub's post-merge rebase, `check` lists
  those layers in `DIVERGED`, and the change path runs this rebase first.
- `needsRebase` is true when a layer's base is not its ancestor. The lowest
  active layer's base is the local trunk branch, so only `sync` updates it.
- `submit` opens new PRs as drafts. `--open` also marks existing drafts ready,
  so it runs only when the user asks for ready PRs. Mark one PR ready with
  `gh pr ready <n> --repo <repo>`, only on the user's request.
- `submit` exits 0 when GitHub refuses to create, update, or link the stack,
  so `after-submit` reads GitHub's stack. A refused update keeps the old stack
  number that `view --short` prints.
- `submit` cannot change a stacked PR's base. Never `gh pr edit --base` one,
  and never `gh pr create` a layer.

## PR text

`--auto` titles come from a single commit's subject, else the branch name.
Bodies are the repository's PR template unfilled, else the commit body plus a
gh-stack footer. Rewrite each new PR's title and body:

- Write the title and body to temp files with the file-writing tool. The body
  follows the repository's PR template.
- Run `gh pr edit <n> --repo <repo> --title "$(cat <title-file>)" --body-file <body-file>`.
  The shell does not reparse text that `$(cat ...)` substitutes, so a title
  that holds `$(...)` stays text. A quoted title literal would run it.

## The script

Run `node "<skill-dir>/scripts/stack-guard.mjs" <subcommand> > <out-file>`
from inside the repository. Its header lists every exit code.

- `repo` picks the one remote that hosts the PRs and stops unless every source
  names its repository. It reads `git remote`, each remote's `url` and
  `pushurl` before `insteadOf` rewriting, `remote.pushDefault`, each
  `remote.<name>.gh-resolved`, `GH_REPO`, and
  `gh repo view --json nameWithOwner,url,defaultBranchRef`.
- `check --remote <remote>` runs the repository test, reads
  `gh stack view --json`, every layer's PRs, and the GitHub stack, and takes
  each PR's state from GitHub, because `view --json` can drop a closed PR and
  miss a queued one. It stops on another author's PR, a closed or queued PR, or
  a branch with two open PRs, and when another worktree holds a layer. Then it
  fetches `<remote>`, fast-forwards a layer that is behind its remote copy,
  and stops on a layer whose remote copy has commits the local layer lacks.
  It writes the record.
- `check --remote <remote> --trunk <trunk> <branch>...` is named mode, for
  branches no stack holds yet. It runs the same tests on the named branches and
  every unmerged PR on each one's GitHub stack, with no `gh stack` call.
- `compare <record>` fetches again and exits 5 when any recorded remote tip,
  PR, PR state, merged layer's local tip, or the GitHub stack's PRs changed, or
  a new layer has a PR or a remote branch. It prints nothing on a pass.
- `after-submit <record>` passes when every active layer has an open PR and
  GitHub's stack holds the active layers' PRs bottom to top.

An active layer is one whose PR is neither merged nor queued, the set
`gh stack` pushes.

| Key           | Printed by         | Value                                                                             |
| ------------- | ------------------ | --------------------------------------------------------------------------------- |
| `REMOTE`      | `repo`, `check`    | the remote to pass as `--remote`                                                  |
| `REPO`        | `repo`, `check`    | `<host>/<owner>/<repo>`, to pass as `--repo`                                      |
| `DEFAULT`     | `repo`             | the repository's default branch                                                   |
| `TRUNK`       | `check`            | the stack's trunk                                                                 |
| `RECORD`      | `check`            | the record's path, for `compare` and `after-submit`                               |
| `FORWARDED`   | `check`            | layers `check` fast-forwarded to their remote copy                                |
| `DIVERGED`    | `check`            | diverged layers that passed, because every remote commit has a local copy         |
| `STACKED`     | `check` named mode | named branches whose open PR is already in a GitHub stack                         |
| `REMOTE_ONLY` | `check`            | PRs on the GitHub stack whose branches the local stack lacks, each yours and open |
| `NO_PR`       | `check`            | active layers with no open PR                                                     |
| `STACK`       | `after-submit`     | GitHub's stack number                                                             |

## Limits

- A stack lives in one repository. Cross-fork stacks are not supported.
- GitHub runs required checks on every stacked PR as if it targeted the trunk.
- Merging a stack needs linear history, and every lower PR's checks to pass.
- A stack holds at most 100 PRs.
