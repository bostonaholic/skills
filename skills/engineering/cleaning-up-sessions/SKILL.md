---
name: cleaning-up-sessions
description: Lists what agent sessions left behind in a repository (worktrees, local branches merged or gone upstream, session scratch trees, and dev servers running from the repo) with age and merged status, then removes each item only after approval. Use when the user says "clean up", or after a PR lands, or when the user asks to prune merged or orphaned branches, remove stale worktrees, kill leftover dev servers, or check whether a branch is pushed or unused. Not for freeing disk space in general; use freeing-disk-space.
---

# Cleaning up sessions

Remove only what a merge or a remote already preserves.

## List

Run `scripts/list.sh [<repo>]` from the repository, or pass any directory
inside it. It runs `git fetch --prune origin`, then prints one tab-separated
row per item:

| Column     | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `kind`     | `worktree`, `branch`, `scratch`, `port`, or `warning`            |
| `target`   | path, branch name, or `:<port> pid <pid> (<cwd>)`                |
| `age_days` | whole days since it last changed                                 |
| `merged`   | `yes` when its tip is in the default branch or heads a merged PR |
| `action`   | `delete`, `stop`, or `keep (<reason>)`                           |
| `command`  | what removes it, or `-`                                          |

Take each row's action and command as printed; never upgrade a keep row to
delete. The script already keeps the current branch and worktree, the default
branch, anything with uncommitted or unpushed commits, unmerged work, and any
worktree changed in the last 7 days.

A `warning` row means a scratch tree under `/private/tmp/claude-*` has a commit
from the last day. Quote it to the user before the table: a live session may
still be using it, or its commits are the only copy.

Exit 64: more than one argument, or the path is not in a git repository.
Exit 69: a required tool is missing. Report the error and stop. A `note:` line
on stderr (fetch failed, `lsof` missing) still lists; say what it left out.

## Approve and remove

Present one table, deletes first, then keeps with their reasons:

| Kind | Target | Age (days) | Merged | Action | Command |
| ---- | ------ | ---------- | ------ | ------ | ------- |

Stop for approval. Run nothing that deletes, removes, or kills until the user
approves those rows. "Clean up" alone is not approval of the table.

Run approved commands one at a time, in table order. A `git worktree remove`
that fails on modified files means the tree changed since listing: report it
and skip it, never retry with `--force`. Re-run `scripts/list.sh` at the end
and show what is left.
