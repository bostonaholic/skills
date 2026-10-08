# Changelog

## [Unreleased]

### Changed

- Make `investigating-design-rationale` fire on Sonnet for "why is this code shaped this way" questions, even when commits or PR text are already in context. [#73](https://github.com/bostonaholic/skills/pull/73)

## [0.21.2] - 2026-10-10

- Keep `explaining-code` Brief replies to at most seven sentences with no headings or lists, leaving tests, reviewer notes, and implementation detail to the full explanation. [#71](https://github.com/bostonaholic/skills/pull/71)

## [0.21.1] - 2026-10-10

### Fixed

- Load being-extremely-fucking-brief before every reply, including plain questions, and keep its three lines short with no blank lines between them. [#67](https://github.com/bostonaholic/skills/pull/67)

## [0.21.0] - 2026-10-10

### Added

- Add `writing-no-tests`, a skill that dares the agent to write no tests. [#86](https://github.com/bostonaholic/skills/pull/86)

## [0.20.1] - 2026-10-09

### Fixed

- Verify reused review findings against current code before reporting them as current. [#87](https://github.com/bostonaholic/skills/pull/87)

## [0.20.0] - 2026-10-08

### Changed

- Keep exact formats, values, and edge cases the user cares about verbatim when `cutting-skills` trims a skill. [#83](https://github.com/bostonaholic/skills/pull/83)
- Add a `## Pre-merge` documentation checkbox to PR bodies written by `using-gh-cli`, and fill in the repository's PR template when one exists. [#83](https://github.com/bostonaholic/skills/pull/83)

## [0.19.0] - 2026-10-08

### Changed

- Trim every skill to the goal, gates, and gotchas a frontier model would otherwise get wrong, dropping checklists, report templates, and per-step subagent dispatch. [#81](https://github.com/bostonaholic/skills/pull/81)
- Add a rebase-only mode to `merging-dependabot-prs`, replacing `rebasing-dependabot-prs`. [#81](https://github.com/bostonaholic/skills/pull/81)
- Add a report-only review mode to `simplifying-ruby-code`, replacing `reviewing-rails-code` and `reviewing-ruby-code`. [#81](https://github.com/bostonaholic/skills/pull/81)

### Removed

- Retire `rebasing-dependabot-prs`, `reviewing-rails-code`, `reviewing-ruby-code`, and `using-jq`. [#81](https://github.com/bostonaholic/skills/pull/81)
- Remove the `clean-code-architect` subagent. [#81](https://github.com/bostonaholic/skills/pull/81)

## [0.18.0] - 2026-10-08

### Changed

- Put the ticket reference (`Closes #<n>`) first in PR bodies written by `using-gh-cli`, above `## Summary`. [#53](https://github.com/bostonaholic/skills/pull/53)

## [0.17.0] - 2026-10-07

### Changed

- Delegate skill steps to fresh-context subagents by default in Claude Code and Codex, keeping approval, shared-state, and trivial steps inline. [#27](https://github.com/bostonaholic/skills/pull/27)

## [0.16.0] - 2026-10-07

### Added

- Add `fixing-root-causes`, moved from Team's `principle-fix-root-causes`, which traces a bug to its root cause and fixes it there instead of patching the symptom. [#26](https://github.com/bostonaholic/skills/pull/26)

## [0.15.1] - 2026-10-07

### Changed

- Reformat bundled skill scripts with oxfmt and clean up lint warnings, with no behavior change. [#25](https://github.com/bostonaholic/skills/pull/25)

## [0.15.0] - 2026-10-06

### Added

- Add `explaining-code`, which explains a PR, diff, or piece of code briefly or in full for a reviewer (`elie`). [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `verifying-production-changes`, which gates on a deploy by revision ancestry and verifies migrations and backfills read-only. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `writing-technical-design-docs`, which drafts directionally correct design docs. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `auditing-rails-tech-debt`, which audits a Rails app for tech debt with cited findings and before/after code. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `auditing-agent-token-usage`, which audits Claude Code and Codex session logs for token and context cost. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `summarizing-friction-logs`, which renders frog friction logs across a workspace as one prioritized dashboard. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `conducting-deep-research`, which pairs a scholarly evidence review with an institution and funding map. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `freeing-disk-space`, which finds what fills a developer machine's disk and clears regenerable caches and build outputs after approval. [#24](https://github.com/bostonaholic/skills/pull/24)
- Add `summarizing-shipped-work`, which turns merged PRs into a shipped-work report and offers a brag document update. [#24](https://github.com/bostonaholic/skills/pull/24)

### Changed

- Let `reviewing-design-docs` review a URL or pasted document, check consistency, problem fit, and operational risk, and judge early drafts on direction. [#24](https://github.com/bostonaholic/skills/pull/24)
- Route broad Rails tech-debt audits from `reviewing-rails-code` to `auditing-rails-tech-debt`, and PR or diff explanations from `explaining-architecture` to `explaining-code`. [#24](https://github.com/bostonaholic/skills/pull/24)

## [0.14.0] - 2026-10-06

### Added

- Install the skills and subagents as a Cursor plugin. [#23](https://github.com/bostonaholic/skills/pull/23)

### Fixed

- Keep the `oracle` subagent read-only in Cursor, which ignores its tool list. [#23](https://github.com/bostonaholic/skills/pull/23)
- Ask in chat when `reviewing-design-docs` or `removing-comments` runs on a host without `AskUserQuestion`. [#23](https://github.com/bostonaholic/skills/pull/23)

## [0.13.0] - 2026-10-06

### Added

- Add a testing rule that proves a claimed race with a test driving each side on its own connection and detecting blocking by timeout. [#17](https://github.com/bostonaholic/skills/pull/17)
- Add a testing rule that proves a coverage gap by deleting the behavior's code and showing the suite stays green. [#17](https://github.com/bostonaholic/skills/pull/17)
- Re-request review from each reviewer whose latest review requested changes once an `addressing-pr-comments` or `watching-authored-prs` pass leaves no feedback awaiting a response. [#17](https://github.com/bostonaholic/skills/pull/17)

### Changed

- Condense the shared writing procedure into one ordered paragraph. [#17](https://github.com/bostonaholic/skills/pull/17)
- Size a document to the decision it supports instead of capping it at one page. [#17](https://github.com/bostonaholic/skills/pull/17)

### Fixed

- Make `addressing-pr-comments` rate a comment's concern rather than its citation, so a wrong premise no longer declines a real defect. [#17](https://github.com/bostonaholic/skills/pull/17)
- Keep a comment that `removing-comments` cannot verify, removing only one that is demonstrably obsolete or contradicted by the code. [#17](https://github.com/bostonaholic/skills/pull/17)
- Keep printing the `watching-authored-prs` poll snapshot on a wake with no new feedback, so compaction recovery still has it. [#17](https://github.com/bostonaholic/skills/pull/17)

## [0.12.0] - 2026-10-06

### Changed

- Point `learning-from-mistakes` to `running-retros` for lessons from a whole session. [#16](https://github.com/bostonaholic/skills/pull/16)
- Stop `writing-prose` from suggesting semicolons as an em dash replacement. [#16](https://github.com/bostonaholic/skills/pull/16)

### Fixed

- Hand a requested merge in `using-gh-cli` to `landing-prs`, and without it squash-merge only after checks pass and the merge state is `CLEAN`. [#16](https://github.com/bostonaholic/skills/pull/16)
- Skip Dependabot PRs in `rebasing-open-prs` and point them to `rebasing-dependabot-prs`, since a push by anyone else stops Dependabot updating the PR. [#16](https://github.com/bostonaholic/skills/pull/16)

## [0.11.0] - 2026-10-06

### Added

- Let `grooming-backlogs` ready the top issues in one run with `--promote-top [<count>]` (default 4) and an optional `--focus <area>`, each issue behind its own approval and stopping at the Ready column's limit. [#15](https://github.com/bostonaholic/skills/pull/15)
- Let `grooming-backlogs` find the board from the project's work-tracking section in `AGENTS.md` or `CLAUDE.md`, then the repository's linked projects, before listing every visible project. [#15](https://github.com/bostonaholic/skills/pull/15)
- Read `grooming-backlogs` board settings from the project's work-tracking section too, under the same confirmation rules as the board's README. [#15](https://github.com/bostonaholic/skills/pull/15)

### Changed

- Require a Decisions section and numbered Verification Steps before `grooming-backlogs` promotes an issue; an issue with an unresolved design question is reported, not promoted. [#15](https://github.com/bostonaholic/skills/pull/15)
- Name only an unblocked, decided issue in the `grooming-backlogs` board-mode `Next:` recommendation. [#15](https://github.com/bostonaholic/skills/pull/15)

## [0.10.0] - 2026-10-06

### Added

- Add `pricing-creativity`, which applies Blair Enns's _Pricing Creativity_ frameworks to value-based pricing, options, retainers, and price negotiation. [#21](https://github.com/bostonaholic/skills/pull/21)

## [0.9.0] - 2026-10-06

### Added

- Ship two Claude Code subagents with the plugin, loaded as `bostonaholic:<name>`: `oracle` gives a read-only second opinion on a stuck diagnosis or design trade-off, and `clean-code-architect` takes a feature or refactor to implement and test. [#12](https://github.com/bostonaholic/skills/pull/12)

## [0.8.0] - 2026-10-06

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

[0.7.0]: https://github.com/bostonaholic/skills/compare/v0.6.0...v0.7.0

[0.8.0]: https://github.com/bostonaholic/skills/compare/v0.7.0...v0.8.0

[0.9.0]: https://github.com/bostonaholic/skills/compare/v0.8.0...v0.9.0

[0.10.0]: https://github.com/bostonaholic/skills/compare/v0.9.0...v0.10.0

[0.11.0]: https://github.com/bostonaholic/skills/compare/v0.10.0...v0.11.0

[0.12.0]: https://github.com/bostonaholic/skills/compare/v0.11.0...v0.12.0

[0.13.0]: https://github.com/bostonaholic/skills/compare/v0.12.0...v0.13.0

[0.14.0]: https://github.com/bostonaholic/skills/compare/v0.13.0...v0.14.0

[0.15.0]: https://github.com/bostonaholic/skills/compare/v0.14.0...v0.15.0

[0.15.1]: https://github.com/bostonaholic/skills/compare/v0.15.0...v0.15.1

[0.16.0]: https://github.com/bostonaholic/skills/compare/v0.15.1...v0.16.0

[0.17.0]: https://github.com/bostonaholic/skills/compare/v0.16.0...v0.17.0

[0.18.0]: https://github.com/bostonaholic/skills/compare/v0.17.0...v0.18.0

[0.19.0]: https://github.com/bostonaholic/skills/compare/v0.18.0...v0.19.0

[0.20.0]: https://github.com/bostonaholic/skills/compare/v0.19.0...v0.20.0

[0.20.1]: https://github.com/bostonaholic/skills/compare/v0.20.0...v0.20.1

[0.21.0]: https://github.com/bostonaholic/skills/compare/v0.20.1...v0.21.0

[0.21.1]: https://github.com/bostonaholic/skills/compare/v0.21.0...v0.21.1

[Unreleased]: https://github.com/bostonaholic/skills/compare/v0.21.2...HEAD
[0.21.2]: https://github.com/bostonaholic/skills/compare/v0.21.1...v0.21.2
