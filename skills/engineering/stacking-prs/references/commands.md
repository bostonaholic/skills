# gh stack commands

## Contents

- [Version](#version)
- [Rules for every command](#rules-for-every-command)
- [Safe forms](#safe-forms)
- [Command notes](#command-notes)
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

| Run                                                                                              | Never run                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `gh stack view --json`, `gh stack view --short`                                                  | bare `view`, a full-screen view under a terminal                                                      |
| `gh stack init --base <trunk> <branch>`. Several names only when all but the last exist locally. | bare `init`, which prompts or exits 5, or `init` without `--base`                                     |
| `gh stack add <branch>`                                                                          | bare `add`, which prompts for a name, or `add` with `-m`, `-A`, or `-u`, which commit or stage for it |
| `gh stack checkout <target>`                                                                     | bare `checkout`, which opens a picker                                                                 |
| `gh stack up`, `down`, `top`, `bottom`                                                           | `gh stack switch`, a menu only                                                                        |
| `git commit -F <message-file>`                                                                   | bare `git commit`, `git add -p`, `git add -i`, which open an editor or a prompt                       |

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

## The script

`node "<skill-dir>/scripts/stack-guard.mjs" repo > <out-file>` picks the one
remote that hosts the PRs and stops unless every source names its repository.
It reads `git remote`, each remote's `url` and `pushurl` before `insteadOf`
rewriting, `remote.pushDefault`, each `remote.<name>.gh-resolved`,
`GH_REPO`, and `gh repo view --json nameWithOwner,url,defaultBranchRef`.

| Key       | Value                                        |
| --------- | -------------------------------------------- |
| `REMOTE`  | the remote to pass as `--remote`             |
| `REPO`    | `<host>/<owner>/<repo>`, to pass as `--repo` |
| `DEFAULT` | the repository's default branch              |

## Limits

- A stack lives in one repository. Cross-fork stacks are not supported.
- GitHub runs required checks on every stacked PR as if it targeted the trunk.
- Merging a stack needs linear history, and every lower PR's checks to pass.
- A stack holds at most 100 PRs.
