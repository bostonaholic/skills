---
name: version-bump
description: Use on explicit version-bump or land intent, or as this repository's declared pre-merge step. Prepares and checks the release immediately before merging.
disable-model-invocation: true
metadata:
  internal: true
---

# Version at land time

This is repository development tooling, excluded from the distributed plugin.
Run only when the user requests versioning or landing, or a land command reaches
this repository's pre-merge step. Finished work, green CI, and an unbumped check
failure during review do not authorize versioning. Read `docs/versioning.md`.

1. Resolve the PR and its default base branch through `gh pr view` and
   `gh repo view`. Fetch the base successfully; require that its fetched tip is
   an ancestor of this checkout's HEAD. If behind, rebase and re-enter this step.
   Require a clean working tree and ensure this checkout is the PR's branch.
2. Choose the level from the distributed change. Before 1.0, observable changes
   (including breaking changes) use `minor`; internal, backward-compatible
   corrections use `patch`. After 1.0, breaking changes use `major`, new behavior
   uses `minor`, compatible fixes use `patch`. Declaring 1.0 is a separate owner
   decision. Bootstrap uses `minor` and prepares `0.1.0`.
3. Run `npm run release:prepare -- <level> origin/<base>`. The script decides
   whether runtime changed, synchronizes shared files, updates manifest/package/
   lockfile versions, and cuts `[Unreleased]` into a dated release section. It
   refuses empty notes. Add accurate bullets and retry if necessary. Its
   `runtime: false` result means no bump, no cut, and a plain conventional title.
   An `alreadyPrepared` result reuses the prepared version; never increment twice.
4. Inspect the generated diff. Run `npm test` and `git diff --check`. If changes
   were generated, require `git config --get commit.gpgsign` to return `true`,
   stage only release files and generated active shared copies, and commit with
   `git commit -S -m "chore(version): X.Y.Z"`. Verify the good signature with
   `git log -1 --show-signature`. A signing failure stops; never bypass it.
5. Run `npm run release:check -- origin/<base>`. On failure, stop before merging.
   Set the PR title to `vX.Y.Z <type>: <subject>` for runtime releases, removing
   any old version prefix first. Development-only PRs use `<type>: <subject>`.
   Verify the title through `gh pr view`.
6. Return to the land command to push, wait for CI, fetch the base again, and
   repeat the check immediately before squash-merging the exact tested PR head.
   If another PR landed, stop, rebase, and reconcile the old bump/changelog cut
   before preparing again. Never overwrite an existing tag or choose a new
   version merely to evade a collision.

Preparation does not push, merge, tag, or publish. After merge, the release
workflow checks shared copies, verifies versions and notes, creates and verifies
a signed tag, then publishes a GitHub release. No separate version PR exists.
