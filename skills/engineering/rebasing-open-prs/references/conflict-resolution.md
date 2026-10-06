# Rebase conflict resolution

The goal is a correct rebase, never a fast, destructive one. When a conflict
cannot be resolved with confidence, stop and flag it.

## Sides

A rebase replays the PR's commits on top of the new base, so in each conflict:

- **`ours` (`<<<<<<< HEAD`)** is the base branch's version.
- **`theirs` (`>>>>>>> <commit>`)** is the PR's change being replayed.

This is the reverse of a merge. Never keep one side whole.

- **Preserve the PR's intent.** Re-apply the PR's change on top of the base's
  refactors.
- **Keep both when both are additive:** two new functions, imports, or list
  entries usually both belong.
- After resolving, re-read the whole hunk: no leftover markers, duplicated
  declarations, or half-merged statements.

Never run `git rebase --skip` to make a conflict disappear; it drops the PR's
commit. Use it only when git reports the patch is empty because the change
already landed in the base.

## File types

- **Lockfiles** (`package-lock.json`, `yarn.lock`, `Cargo.lock`,
  `Gemfile.lock`, `poetry.lock`): do not hand-merge. Take the base's version,
  finish the rebase, then regenerate with the project's package manager and
  amend.
- **Generated files and snapshots:** regenerate from source.
- **Migrations and other ordered sequences:** keep both, and renumber the PR's
  entry to follow the base's so IDs and timestamps do not collide.
- **`CHANGELOG.md`:** keep both entries; place the PR's under the right heading.
- **Imports and dependency manifests:** take the union, then de-duplicate.

## Stop conditions

Abort the rebase, leave the PR unpushed, and record `conflicts-flagged` with the
affected files and a one-line reason when:

- a conflict needs a product or semantic decision between two incompatible
  intents;
- resolution confidence is low, so a guess could ship broken code to an open
  PR; or
- a check fails because of the resolution and the fix is not obvious.

A flagged PR a human can finish beats a forced bad rebase.
