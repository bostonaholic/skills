# Rebase conflict resolution

The goal is a correct rebase, never a fast, destructive one.

During a rebase, `ours` (`<<<<<<< HEAD`) is the base branch and `theirs` is
the PR's commit being replayed, the reverse of a merge. Never keep one side
whole: re-apply the PR's intent on top of the base's changes. Never run
`git rebase --skip` to make a conflict disappear; it drops the PR's commit.
Use it only when git reports the patch is empty because the change already
landed in the base.

## File types

- **Lockfiles:** do not hand-merge. Take the base's version, finish the
  rebase, then regenerate with the project's package manager and amend.
- **Generated files and snapshots:** regenerate from source.
- **Migrations and other ordered sequences:** keep both, and renumber the PR's
  entry to follow the base's so IDs and timestamps do not collide.

## Stop conditions

Abort the rebase, leave the PR unpushed, and record `conflicts-flagged` with
the affected files and a one-line reason when a conflict needs a product or
semantic decision between incompatible intents, when resolution confidence is
low, or when a check fails because of the resolution and the fix is not
obvious. A flagged PR a human can finish beats a forced bad rebase.
