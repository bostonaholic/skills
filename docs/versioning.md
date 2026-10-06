# Versioning and releases

Assign versions immediately before merging, on explicit land intent. One PR
lands at a time. During review, keep a plain conventional PR title. For changes
requiring a release, put user-facing changelog bullets under `## [Unreleased]`.
Development-only PRs need no changelog entry. There are no Changesets files,
separate version PRs, or npm package publications.

## What releases

Changes under `skills/engineering/` and `skills/productivity/`, plus functional
changes in the plugin and marketplace manifests, require a release.
Renames and removals count. Shared source edits reach users through regenerated
copies in active skills. Archives, tests, workflows, site code, and maintainer
documentation alone do not bump the version. Manifest comparisons ignore
`version`, each manifest's top-level `description`, and marketplace
`plugins[].description`. Description-only edits do not require a release.
All other manifest fields still count, including plugin names, sources,
registered skills, and runtime configuration. Adding or removing a manifest
also requires a release.

For changes that require a release, before 1.0, observable changes use **minor**,
including breaking changes. Visible documentation or description edits alone
do not qualify.
Internal, backward-compatible corrections use **patch**. Declaring 1.0 requires
an explicit stability decision. After 1.0, breaking changes use **major**, new
functionality **minor**, and compatible fixes **patch**. Commit type does not
choose the level.

## Changelog entries

- Write one bullet per change, using a short sentence describing what changed
  for the user. Split unrelated changes into separate bullets.
- End every bullet with `[#NNN](https://github.com/bostonaholic/skills/pull/NNN)`.
  Use the actual PR number in both the label and URL, with nothing after the link.
- Multiple changes from one PR each get their own bullet and repeat that PR link.
- Omit implementation narratives, commit lists, and review history. The linked
  PR contains those details.
- Add entries under `[Unreleased]` during review only for changes requiring a
  release. Site-only and other development-only changes need no entry. Check
  this format before cutting the release section; preserve the bullets and
  links in release notes.

Example:

```markdown
- Add standalone code reviews. [#2](https://github.com/bostonaholic/skills/pull/2)
```

## Before merge

The declared pre-merge procedure is
[`.claude/skills/version-bump/SKILL.md`](../.claude/skills/version-bump/SKILL.md).
Land commands, including `/landing-prs`, read that declaration in `AGENTS.md`.
Its `metadata.internal: true` keeps it out of normal `npx skills` discovery;
the plugin manifest also excludes it. It remains available to repository maintainers.

1. Resolve and fetch the PR's base branch. Rebase if its fetched tip is not an
   ancestor of the current branch. Require a clean checkout.
2. Run `npm run release:prepare -- minor origin/main` (choose the actual level
   and base). This regenerates shared copies, computes the version from the
   fetched base, updates `.claude-plugin/plugin.json`, `package.json`, and both
   root versions in `package-lock.json`, and cuts the dated changelog section.
3. Review the generated diff, run `npm test`, and make a signed
   `chore(version): X.Y.Z` commit. Verify its signature.
4. Run `npm run release:check -- origin/main`. For runtime changes, set the PR
   title to `vX.Y.Z <type>: <subject>`. For development-only changes, keep a
   plain conventional title and do not bump or cut a changelog section.
5. Push, wait for CI, re-fetch the base, repeat the check, and squash-merge the
   tested head. If the base moved, rebase and reconcile the prepared version.

The check deliberately fails on an unversioned runtime PR during review; it is
a merge precondition. Regular CI checks script behavior and packaging without
requiring a release to be prepared early. There is no shell interception hook:
a raw terminal or GitHub UI merge can bypass the declared pre-merge procedure.
The release job refuses invalid release inputs, but cannot undo such a merge.

The PR title workflow is a backup: it compares against the branch's merge-base
and only prefixes a forward version with a dated changelog section. It never
versions an unprepared PR. It skips fork PRs; maintainers set their titles.

## Initial release

The bootstrap PR's manifests contain `0.1.0` as their initial value; its notes
remain under `[Unreleased]` until land time. When the base has no plugin
manifest, preparation cuts `0.1.0`, rather than incrementing to `0.2.0`.
The title workflow waits for the dated section before prefixing the title.

## After merge

`release-on-merge.yml` runs on `main` pushes and can be rerun manually on `main`.
It runs `npm run release:publish`, which checks shared-copy synchronization
without repairing files, checks version consistency and release notes, creates
`vX.Y.Z` with `git tag -s`, verifies it with `git tag -v`, and pushes the tag.
It then creates the GitHub release using that tag's changelog section as notes.
No dependencies need installing to run the release tooling.

Existing signed tags are reused only when they belong to this commit's history
and no runtime change occurred since them. Existing releases are left intact.
This allows development-only merges and repairs a tag-pushed/release-failed run
without replacing a tag. Tag collisions, unsigned tags, missing notes, stale
shared copies, and inconsistent versions fail the job.

## Signing

`RELEASE_SIGNING_KEY` is a repository Actions secret containing a dedicated SSH
private key. `.github/release-signing-key.pub` holds the matching public key.
The workflow verifies their match, configures SSH signing, and removes temporary
key files even on failure. The personal developer signing key is never used in
Actions. Local maintainer commits continue using the developer's signing setup.

To rotate the release key, update the public key and encrypted secret together.
Preserve verification access to older public keys when rotating; existing tags
must continue to verify. Never bypass signing to recover a failed release.

## Recovery

- **Shared-copy drift:** run `npm run sync-shared`, review and commit the copies,
  then rerun checks. Publication never silently fixes the tagged source.
- **CI failed before merge:** fix the branch and re-enter the pre-merge procedure.
  A valid prepared version is reused; another bump is not added.
- **Base advanced:** rebase, restore the new base's versions, move this PR's
  prepared notes back under `[Unreleased]`, remove the obsolete release section
  and link, then prepare against the fetched base. Preserve other PRs' notes.
- **Tag pushed, release failed:** rerun the release workflow. It verifies and
  reuses the tag, reads notes from the tagged commit, and creates the release.
- **Tag collision or signature failure:** stop and investigate. Never force-push
  tags, delete published releases, or create an unsigned replacement.
