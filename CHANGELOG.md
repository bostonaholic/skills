# Changelog

## [Unreleased]

### Added

- Add a file inventory (hidden files, executables, binaries, minified code) and container, CI, and privilege patterns to `auditing-repo-security`. [#14](https://github.com/bostonaholic/skills/pull/14)
- Let `auditing-repo-security` fan its pattern scan out to one read-only subagent per category, then trace chains of hits across files. [#14](https://github.com/bostonaholic/skills/pull/14)

### Changed

- Narrow `auditing-repo-security` to third-party or freshly cloned repositories, so it no longer triggers for security review of the user's own code. [#14](https://github.com/bostonaholic/skills/pull/14)

## [0.7.0] - 2026-10-06

### Changed

- Rename every skill to a gerund name, for example `shipit` to `landing-prs` and `code-review` to `reviewing-code`; invoke skills by their new names. [#18](https://github.com/bostonaholic/skills/pull/18)
- Rewrite every skill description to say what the skill does and when to use it. [#18](https://github.com/bostonaholic/skills/pull/18)
- Trim every skill to its behavioral core and link each reference directly from its `SKILL.md`. [#18](https://github.com/bostonaholic/skills/pull/18)
- Move `redoing-implementations` to the engineering category. [#18](https://github.com/bostonaholic/skills/pull/18)
- Rename the `auditing-tests` report key `seams` to `testOnlyCode`. [#18](https://github.com/bostonaholic/skills/pull/18)
- Rewrite `merging-dependabot-prs` as a self-contained, approval-gated procedure that merges only patch and minor updates. [#18](https://github.com/bostonaholic/skills/pull/18)
- Confirm the drafted rule before `learning-from-mistakes` writes it. [#18](https://github.com/bostonaholic/skills/pull/18)
- Make `configuring-zsh` discover the dotfiles layout instead of assuming one. [#18](https://github.com/bostonaholic/skills/pull/18)
- Pin the react-doctor version in `diagnosing-react-code` and ask before its first networked run. [#18](https://github.com/bostonaholic/skills/pull/18)

### Fixed

- Stop `rebasing-open-prs` from force-pushing over remote commits or deleting branches it did not create. [#18](https://github.com/bostonaholic/skills/pull/18)
- Hand behind branches from `landing-prs` to `rebasing-branches` instead of force-pushing inline, and honor the PR argument. [#18](https://github.com/bostonaholic/skills/pull/18)
- Refuse to force-push in `rebasing-branches` when the remote has commits the branch lacks. [#18](https://github.com/bostonaholic/skills/pull/18)
- Save binary changes and untracked files before `redoing-implementations` resets an attempt. [#18](https://github.com/bostonaholic/skills/pull/18)
- Never install dependencies during `auditing-repo-security`, and fix detection patterns that errored or never matched. [#18](https://github.com/bostonaholic/skills/pull/18)
- Correct `using-jq` and `drawing-mermaid-diagrams` examples that failed on current tool versions. [#18](https://github.com/bostonaholic/skills/pull/18)
- Enforce the upload refusals in `attaching-pr-screenshots` and resolve the current branch's PR when none is given. [#18](https://github.com/bostonaholic/skills/pull/18)
- Fix `grooming-backlogs` promotion mode, which read a board cache it never wrote. [#18](https://github.com/bostonaholic/skills/pull/18)
- Include untracked files and skip deleted ones in `removing-comments`. [#18](https://github.com/bostonaholic/skills/pull/18)
- Support GitHub Enterprise hosts in the PR watch and comment skills. [#18](https://github.com/bostonaholic/skills/pull/18)

### Removed

- Move `dev-cli` to the [bostonaholic/dev](https://github.com/bostonaholic/dev) repository, which ships it as a Claude Code plugin: `claude plugin marketplace add bostonaholic/dev`, then `claude plugin install dev@dev`. [#18](https://github.com/bostonaholic/skills/pull/18)
- Remove the unused `write-companion.sh` script from `attaching-pr-screenshots`. [#18](https://github.com/bostonaholic/skills/pull/18)

## [0.6.0] - 2026-10-06

### Changed

- Rename the Claude Code marketplace to `skills`; reinstall with `claude plugin install bostonaholic@skills`. [#11](https://github.com/bostonaholic/skills/pull/11)

## [0.5.0] - 2026-10-05

### Changed

- Rename the Claude Code plugin to `bostonaholic`, shortening the skill prefix; reinstall with `claude plugin install bostonaholic@bostonaholic`. [#9](https://github.com/bostonaholic/skills/pull/9)

## [0.4.1] - 2026-10-05

### Fixed

- Let `retro` find skill edit targets nested one category down, refusing names held by more than one category. [#10](https://github.com/bostonaholic/skills/pull/10)

## [0.4.0] - 2026-10-05

### Added

- Accept a `/retro` prompt naming what to retro on, which sources to read (past sessions, PR review comments, other files), and which repository files to target. [#8](https://github.com/bostonaholic/skills/pull/8)

## [0.3.0] - 2026-10-02

### Added

- Add 20 personal skills to the plugin and catalog. [#1](https://github.com/bostonaholic/skills/pull/1)

### Deprecated

- Archive `bd-go` and `bd-scan`. [#1](https://github.com/bostonaholic/skills/pull/1)

### Fixed

- Avoid version bumps for description-only plugin and marketplace edits. [#4](https://github.com/bostonaholic/skills/pull/4)

## [0.2.0] - 2026-10-02

### Changed

- Remove the “skills that pay the bills” README tagline. [#3](https://github.com/bostonaholic/skills/pull/3)
- Align plugin and package descriptions with the personal software engineering collection. [#3](https://github.com/bostonaholic/skills/pull/3)
- Document how to update the README and site together. [#3](https://github.com/bostonaholic/skills/pull/3)
- Describe the collection as personal software engineering skills in the site and README. [#3](https://github.com/bostonaholic/skills/pull/3)
- Remove the Team extraction note from the site and README. [#3](https://github.com/bostonaholic/skills/pull/3)

## [0.1.0] - 2026-10-02

### Added

- Add 18 standalone skills extracted from the Team plugin. [#2](https://github.com/bostonaholic/skills/pull/2)
- Install the full collection as a managed Claude Code plugin. [#2](https://github.com/bostonaholic/skills/pull/2)
- Install individual skills for supported agents with `npx skills`. [#2](https://github.com/bostonaholic/skills/pull/2)
- Include each skill’s shared rules in its installation. [#2](https://github.com/bostonaholic/skills/pull/2)
- Organize active skills into engineering and productivity categories. [#2](https://github.com/bostonaholic/skills/pull/2)
- Publish a generated skill catalog with usage and installation instructions. [#2](https://github.com/bostonaholic/skills/pull/2)

### Changed

- Allow `eng-design-doc-review` to review any design document. [#2](https://github.com/bostonaholic/skills/pull/2)
- Remove cross-model vendor passes from standalone design reviews. [#2](https://github.com/bostonaholic/skills/pull/2)
- Use independent reviewers for code and design reviews across supported hosts. [#2](https://github.com/bostonaholic/skills/pull/2)
- Organize code reviews into Summary, Findings, and Checks sections. [#2](https://github.com/bostonaholic/skills/pull/2)
- Report incomplete code-review checks without approving the changes. [#2](https://github.com/bostonaholic/skills/pull/2)
- Trace claims directly in the session with `prove`. [#2](https://github.com/bostonaholic/skills/pull/2)
- Run retrospective analysis in the session with reduced-assurance reporting. [#2](https://github.com/bostonaholic/skills/pull/2)
- Cache `paparazzi` browser tooling outside the project. [#2](https://github.com/bostonaholic/skills/pull/2)
- Omit pipeline phase and round fields from screenshot manifests. [#2](https://github.com/bostonaholic/skills/pull/2)
- Include coverage-based CRAP scores and risk bands in complexity audits. [#2](https://github.com/bostonaholic/skills/pull/2)
- Monitor CI alongside review feedback in `pr-watch-as-author`. [#2](https://github.com/bostonaholic/skills/pull/2)
- Require `pr-open-comments` for author-side PR monitoring. [#2](https://github.com/bostonaholic/skills/pull/2)
- Print a re-arm command when either PR watcher reaches its limit. [#2](https://github.com/bostonaholic/skills/pull/2)
- Exclude the PR author’s own review records from feedback triage. [#2](https://github.com/bostonaholic/skills/pull/2)
- End `shipit` after reporting the merge result, without automatic cleanup. [#2](https://github.com/bostonaholic/skills/pull/2)

### Deprecated

- Archive `pr-cleanup` and exclude it from active installations. [#2](https://github.com/bostonaholic/skills/pull/2)

[0.1.0]: https://github.com/bostonaholic/skills/releases/tag/v0.1.0

[0.2.0]: https://github.com/bostonaholic/skills/compare/v0.1.0...v0.2.0

[0.3.0]: https://github.com/bostonaholic/skills/compare/v0.2.0...v0.3.0

[0.4.0]: https://github.com/bostonaholic/skills/compare/v0.3.0...v0.4.0

[0.4.1]: https://github.com/bostonaholic/skills/compare/v0.4.0...v0.4.1

[0.5.0]: https://github.com/bostonaholic/skills/compare/v0.4.1...v0.5.0

[0.6.0]: https://github.com/bostonaholic/skills/compare/v0.5.0...v0.6.0

[Unreleased]: https://github.com/bostonaholic/skills/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/bostonaholic/skills/compare/v0.6.0...v0.7.0
