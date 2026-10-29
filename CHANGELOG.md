# Changelog

## [Unreleased]

### Added

- Add `writing-no-comments`, a skill that loads before an agent writes or edits code and keeps out every comment a short keep list does not cover. [#164](https://github.com/bostonaholic/skills/pull/164)

### Changed

- `making-code-agent-friendly` adds no comment the shared keep list rejects when it writes code, and its P10 puts a constraint the code cannot show in a test, a type, or the module's README before a comment. [#164](https://github.com/bostonaholic/skills/pull/164)
- The `oracle` subagent suggests a comment only for a constraint from outside the project that the code cannot show. [#164](https://github.com/bostonaholic/skills/pull/164)
- `removing-comments` removes every comment outside the shared keep list, including one it is unsure about, instead of keeping comments that explain a current reason. [#164](https://github.com/bostonaholic/skills/pull/164)
- `reviewing-code` reports every code comment finding as a non-blocking suggestion that shows the code to replace the comment, so comments alone no longer block a review. [#164](https://github.com/bostonaholic/skills/pull/164)

## [0.73.0] - 2026-10-29

### Removed

- Removed `pricing-creativity`: the plugins, `npx skills`, and the Grok Bot strategy set no longer install it. [#163](https://github.com/bostonaholic/skills/pull/163)

## [0.72.1] - 2026-10-28

### Changed

- `addressing-pr-comments` links its options A to G from the skill's opening paragraph, before the rules that name them. [#161](https://github.com/bostonaholic/skills/pull/161)

## [0.72.0] - 2026-10-28

### Changed

- `addressing-pr-comments` posts declines and clarifying questions to the reviewer during the pass instead of pausing for the user; a decline leaves its thread open. [#160](https://github.com/bostonaholic/skills/pull/160)

## [0.71.0] - 2026-10-28

### Added

- `cr` starts a `reviewing-code` review with the same optional diff target in every harness: `/cr` in Claude Code, Cursor, and Grok Bot, `$cr` in Codex. [#158](https://github.com/bostonaholic/skills/pull/158)

## [0.70.0] - 2026-10-28

### Fixed

- `addressing-pr-comments` counts the user's own PR comments as feedback, held to the same bar as any reviewer's, instead of pausing them when other reviewers also commented. [#159](https://github.com/bostonaholic/skills/pull/159)

## [0.69.0] - 2026-10-27

### Changed

- `reviewing-design-docs` reviews a design doc with one fresh-context reviewer per lens, including a naive reader that sees only the doc, and returns one merged report with one verdict. [#157](https://github.com/bostonaholic/skills/pull/157)
- `writing-technical-design-docs` writes every fact from the conversation into the doc, and returns the review output as-is instead of revising the draft. [#157](https://github.com/bostonaholic/skills/pull/157)
- The independent-review rules name who drafts the work, who reviews it with fresh context, and who decides. [#157](https://github.com/bostonaholic/skills/pull/157)

## [0.68.0] - 2026-10-27

### Added

- Accept mp4, mov, and webm in `attaching-pr-screenshots` and render each video as its bare attachment URL so GitHub embeds a player. [#152](https://github.com/bostonaholic/skills/pull/152)

## [0.67.0] - 2026-10-27

### Added

- `addressing-pr-comments`, `composing-agent-prompts`, `explaining-architecture`, `explaining-code`, `fixing-root-causes`, `making-code-agent-friendly`, and `reviewing-code` decide whether docs or code is wrong when they disagree: a failing test and a code fix when the docs state intended behavior, a docs fix when they misdescribe tested behavior. [#151](https://github.com/bostonaholic/skills/pull/151)
- The `oracle` subagent says whether docs or code is wrong when they disagree, instead of trusting the docs. [#151](https://github.com/bostonaholic/skills/pull/151)

## [0.66.0] - 2026-10-26

### Fixed

- `watching-reviewed-prs` verifies a cast approval through the GitHub GraphQL reviews list, so a real approval at the expected commit now reports success, and a missing field or incomplete read never does. [#153](https://github.com/bostonaholic/skills/pull/153)
- `watching-reviewed-prs` can settle a reply that declines a suggestion with a reason the code supports as `answered`, while an unsupported deferral stays `pending`. [#153](https://github.com/bostonaholic/skills/pull/153)

### Changed

- `watching-reviewed-prs` re-reviews return the original ask, the author's argument, the code evidence, and the reason for the verdict, and the watch checks for a weighed argument before it accepts the result. [#153](https://github.com/bostonaholic/skills/pull/153)

## [0.65.1] - 2026-10-25

### Fixed

- `making-code-agent-friendly` reference links resolve from the skill directory. [#148](https://github.com/bostonaholic/skills/pull/148)
- `auditing-rails-tech-debt` names the application directory without a `-root` placeholder. [#148](https://github.com/bostonaholic/skills/pull/148)
- `investigating-design-rationale` links the skill-call rules it follows when calling another skill. [#148](https://github.com/bostonaholic/skills/pull/148)
- `running-retros` links the skill-call rules it follows when calling another skill. [#148](https://github.com/bostonaholic/skills/pull/148)

## [0.65.0] - 2026-10-24

### Changed

- `writing-prose` names a changing set's members instead of stating how many there are. [#147](https://github.com/bostonaholic/skills/pull/147)
- Skill instructions name or link the lists they mean instead of counting them. [#147](https://github.com/bostonaholic/skills/pull/147)

## [0.64.0] - 2026-10-24

### Changed

- Stop installing development npm packages with the plugin: a Claude Code plugin install no longer installs about 90 packages into its cache. [#144](https://github.com/bostonaholic/skills/pull/144)
- Pin the mermaid-cli version that `drawing-mermaid-diagrams` renders with to 12.0.0. [#144](https://github.com/bostonaholic/skills/pull/144)
- Install Chromium in `capturing-screenshots` with the cached Playwright binary, so a failed install can no longer fetch an unpinned Playwright. [#144](https://github.com/bostonaholic/skills/pull/144)
- Point `watching-authored-prs` and `updating-bostonaholic-skills` at INSTALL.md's "One skill" section instead of running `npx skills@latest`. [#144](https://github.com/bostonaholic/skills/pull/144)

## [0.63.1] - 2026-10-24

### Fixed

- Show gh's error in `attaching-pr-screenshots` when `gh` exits before reading the body sent to `POST /markdown`, instead of dropping it. [#143](https://github.com/bostonaholic/skills/pull/143)

## [0.63.0] - 2026-10-24

### Removed

- Retire `using-gh-cli`: it rarely triggered, and models handled its gh cases as well without it. [#141](https://github.com/bostonaholic/skills/pull/141)

## [0.62.0] - 2026-10-23

### Changed

- Write one review finding per defect class, listing every instance and the lint or instruction rule that would catch the class, in the shared finding format used by the review skills. [#140](https://github.com/bostonaholic/skills/pull/140)
- Mark review findings on code the change did not introduce as non-blocking and pre-existing, so a review whose only findings are pre-existing approves. [#140](https://github.com/bostonaholic/skills/pull/140)
- Cap review nitpicks at three and drop any the project's configured formatter or linter already catches. [#140](https://github.com/bostonaholic/skills/pull/140)
- Raise an approach disagreement in the first review as non-blocking, never as a new blocker in a later round. [#140](https://github.com/bostonaholic/skills/pull/140)
- Open each `reviewing-code` summary with the finding count, or say plainly that nothing needs fixing. [#140](https://github.com/bostonaholic/skills/pull/140)
- Check in `reviewing-code` that a change does what its PR, commits, or plan say, and that a bug fix removes the cause instead of hiding the failure. [#140](https://github.com/bostonaholic/skills/pull/140)
- Re-review only the commits since the head an earlier `reviewing-code` report in the conversation recorded, report each earlier finding by status instead of repeating it, and from round 4 with a blocker still open recommend reconsidering the approach. [#140](https://github.com/bostonaholic/skills/pull/140)
- Recommend a follow-up in `addressing-pr-comments` for a comment its reviewer marked pre-existing. [#140](https://github.com/bostonaholic/skills/pull/140)

## [0.61.0] - 2026-10-23

### Changed

- Skip a review summary in `addressing-pr-comments` when its author later approved the PR, so the summary leaves the triage report and no longer blocks the review re-request, and report how many it skipped. [#137](https://github.com/bostonaholic/skills/pull/137)
- Rate review comments in `addressing-pr-comments` by their concern rather than the commenter's account type, and confirm an automated comment's general rule holds in the PR before acting on it. [#137](https://github.com/bostonaholic/skills/pull/137)
- Check the code a reviewer asks to match in `addressing-pr-comments` before copying it, and offer a fix to both sites or a follow-up when that code is wrong. [#137](https://github.com/bostonaholic/skills/pull/137)
- Send review items whose asks conflict with each other to clarification in `addressing-pr-comments` instead of applying either. [#137](https://github.com/bostonaholic/skills/pull/137)
- Fix review items that share one concern in one commit in `addressing-pr-comments`, and pause an item whose change an earlier commit already made. [#137](https://github.com/bostonaholic/skills/pull/137)
- Run each fix's reproduction, covering tests, formatter, and linter in report-only mode before `addressing-pr-comments` commits it, allow one more edit after a failure, stop the fix if a check still fails or times out, and show each result on the item's report line. [#137](https://github.com/bostonaholic/skills/pull/137)
- Apply fixes in `addressing-pr-comments` only when the checkout has no changes beyond the untracked files present at the start of the pass, and keep its temporary files outside the checkout. [#137](https://github.com/bostonaholic/skills/pull/137)
- Keep the edit of an `addressing-pr-comments` fix that fails its checks for the user, name each path it left, and pause that pass's later fixes. [#137](https://github.com/bostonaholic/skills/pull/137)
- Write `addressing-pr-comments` throwaway tests only as new files, so deleting one never removes other work. [#137](https://github.com/bostonaholic/skills/pull/137)

## [0.60.0] - 2026-10-22

### Added

- Add `updating-bostonaholic-skills`, which updates the existing plugin installs and skill copies of the collection to the latest release. [#135](https://github.com/bostonaholic/skills/pull/135)

## [0.59.0] - 2026-10-22

### Added

- Add a `CI rerun` grant to `watching-authored-prs` that re-runs a failed Actions job, at most twice per workflow run, when its log shows a known runner or network fault, and run it first under `CI fix`. [#134](https://github.com/bostonaholic/skills/pull/134)
- Make `watching-authored-prs` resolve a merge conflict on its PR by calling `rebasing-branches`, which rebases and force-pushes with a lease, and stop as `Merge conflict` only when the rebase cannot finish. [#134](https://github.com/bostonaholic/skills/pull/134)

## [0.58.0] - 2026-10-22

### Changed

- Make addressing-pr-comments carry out each item's recommended option by default instead of stopping for a pick, pausing only items that hit an exclusion; the 90% bar now applies only when asked for recommendations alone. [#133](https://github.com/bostonaholic/skills/pull/133)

## [0.57.0] - 2026-10-22

### Added

- Add making-code-agent-friendly, which audits, reviews, and refactors code so many coding agents can change it in parallel without merge conflicts, with red flags, principles with examples, and a git contention script. [#130](https://github.com/bostonaholic/skills/pull/130)

## [0.56.0] - 2026-10-22

### Changed

- Keep every skill agent-agnostic: no harness-specific hooks, frontmatter, or `$ARGUMENTS`-style substitutions, with each argument described in plain words. [#132](https://github.com/bostonaholic/skills/pull/132)
- Keep every `SKILL.md` short and checklist-shaped, at most 100 body lines with no prose paragraph over 50 words, moving detail into `references/`. [#132](https://github.com/bostonaholic/skills/pull/132)
- Make `cutting-skills` and `running-retros` apply both rules to any skill they cut, create, or edit. [#132](https://github.com/bostonaholic/skills/pull/132)

## [0.55.0] - 2026-10-22

### Added

- Add `redesigning-from-first-principles`, an explicit-invocation skill that fits a new requirement into an existing design by redesigning as if it had always been there, then updating every reference in working increments. [#129](https://github.com/bostonaholic/skills/pull/129)

## [0.54.0] - 2026-10-22

### Changed

- End each bundled skill script's own failure with a `see <path>` line naming the skill file that explains it, and pass the error text of git, gh, jq, and the other tools the scripts run through unaltered. [#125](https://github.com/bostonaholic/skills/pull/125)

## [0.53.3] - 2026-10-21

### Fixed

- Make attaching-pr-screenshots' `upload.sh` exit 2, as documented, when its run directory does not exist, instead of exiting 1 with a redirect error. [#128](https://github.com/bostonaholic/skills/pull/128)

## [0.53.2] - 2026-10-21

### Fixed

- Keep gh's stderr out of the PR number that rebasing-branches' `prepare-rebase.sh` reports, so a gh warning or debug line no longer corrupts its exit 7 message. [#127](https://github.com/bostonaholic/skills/pull/127)

## [0.53.1] - 2026-10-21

### Fixed

- Document the script exit codes that ten skills' instructions left out, such as usage errors and missing tools, so an agent knows what each exit means. [#126](https://github.com/bostonaholic/skills/pull/126)

## [0.53.0] - 2026-10-21

### Changed

- Run `cutting-skills`'s Cut mode as a `hillclimbing` loop scored by the target `SKILL.md`'s character count, with the skill checks and any behavior evals as guardrails. [#124](https://github.com/bostonaholic/skills/pull/124)
- Keep author-specific domain guidance in `cutting-skills`, cut restatements of linked material first, and treat a target past the Keep-class material as blocked. [#124](https://github.com/bostonaholic/skills/pull/124)
- Baseline `cutting-skills` evals from the unedited revision, pool noisy reruns before reverting a cut, and report character counts. [#124](https://github.com/bostonaholic/skills/pull/124)

## [0.52.0] - 2026-10-21

### Changed

- Trim 23 skills' `SKILL.md` files by 20% overall, cutting generic advice and rules repeated from script headers and references, to lower the tokens each skill loads. [#123](https://github.com/bostonaholic/skills/pull/123)

## [0.51.0] - 2026-10-21

### Added

- Add `reviewing-security`, a skill that reviews a diff for exploitable vulnerabilities in a fresh-context read-only subagent and reports only high-confidence findings with an exploit scenario and fix. [#122](https://github.com/bostonaholic/skills/pull/122)

### Changed

- Route security review of a diff or PR from `auditing-repo-security` and `reviewing-code` to `reviewing-security`. [#122](https://github.com/bostonaholic/skills/pull/122)

## [0.50.0] - 2026-10-21

### Changed

- Compute `pricing-creativity`'s cost ceiling, MLOE, $Y benchmarks, anchor sell rate, and rounded strategic prices with a script instead of by hand. [#121](https://github.com/bostonaholic/skills/pull/121)

## [0.49.0] - 2026-10-21

### Changed

- Find every caller of a Ruby class in `simplifying-ruby-code` with `scripts/find-callers.sh`, which lists literal, require, and dynamic-lookup references across code, config, gemspecs, and executables. [#120](https://github.com/bostonaholic/skills/pull/120)

## [0.48.0] - 2026-10-21

### Changed

- Resolve the instructions file in `learning-from-mistakes` with `scripts/resolve-instructions-file.sh`, which follows symlinks and import-only files and stops on a loop. [#119](https://github.com/bostonaholic/skills/pull/119)

## [0.47.0] - 2026-10-21

### Changed

- Render, write, and verify the `attaching-pr-screenshots` section and its `result.json` through `scripts/write-body.mjs` and `scripts/write-result.mjs`, with one attachment-URL rule shared by upload and read-back, and refuse a blank caption before any upload. [#118](https://github.com/bostonaholic/skills/pull/118)

## [0.46.0] - 2026-10-21

### Changed

- Write the `capturing-screenshots` manifest and prune its output directory with `scripts/finalize.mjs`, which derives the status, adds each frame's visual verdict, and deletes only files the run or the previous manifest listed. [#117](https://github.com/bostonaholic/skills/pull/117)

## [0.45.0] - 2026-10-21

### Changed

- Run `watching-reviewed-prs`'s arm checks, poll, approval body, and approval verification as scripts, with a state file that keeps verdicts and baselines across a compaction. [#116](https://github.com/bostonaholic/skills/pull/116)

## [0.44.0] - 2026-10-21

### Changed

- Run each `watching-authored-prs` poll, failed-job log read, and CI fix branch check through scripts, with poll state kept in a file that survives compaction. [#115](https://github.com/bostonaholic/skills/pull/115)

## [0.43.0] - 2026-10-21

### Changed

- Build the `addressing-pr-comments` item set, settle each item (reply, resolve, react, verify), and print the review re-request report with scripts, so reruns never double-post. [#114](https://github.com/bostonaholic/skills/pull/114)

## [0.42.0] - 2026-10-21

### Changed

- `removing-comments` checks the reviewer report's format, scope, and verdict with `scripts/check-report.mjs` and applies findings from its JSON. [#113](https://github.com/bostonaholic/skills/pull/113)

## [0.41.0] - 2026-10-21

### Changed

- Resolve the timeframe in `summarizing-shipped-work` with `scripts/resolve-timeframe.mjs`, halve a search that reaches the cap down to one day in `fetch-shipped-prs.sh`, and print `pr_label` and `title_ticket_links` in place of `title_ticket_keys`. [#112](https://github.com/bostonaholic/skills/pull/112)

## [0.40.0] - 2026-10-21

### Changed

- Move `running-retros` edit preconditions, issue filing, and past-session listing into `check-edit-target.sh`, `file-issue.sh`, and `list-sessions.mjs`, and let `write-target.mjs` read a name or path from a file, replacing retyped shell checks. [#111](https://github.com/bostonaholic/skills/pull/111)

## [0.39.0] - 2026-10-21

### Changed

- Size the volume, the default free-space target, and every known cache location in `freeing-disk-space` with `scripts/measure-caches.sh`, and list pinned toolchain versions with `scripts/list-pinned-versions.sh`, both read-only. [#110](https://github.com/bostonaholic/skills/pull/110)

## [0.38.0] - 2026-10-21

### Changed

- Run the board load, the mechanical gap-inventory rows, Ready slot counts, card moves, dependency links, and closures in `grooming-backlogs` through tested scripts, leaving the model only judgment. [#109](https://github.com/bostonaholic/skills/pull/109)

## [0.37.0] - 2026-10-21

### Changed

- Compute CRAP only in `auditing-complexity`'s renderer, so lane analysts no longer return a `crap` value that the renderer checked against its own. [#108](https://github.com/bostonaholic/skills/pull/108)

## [0.36.0] - 2026-10-21

### Changed

- Add `scripts/find-leads.mjs` to `auditing-rails-tech-debt`, which ranks models and controllers by size, cross-checks `db/schema.rb` for foreign key, money, and shadowing `attr_accessor` leads, and runs the reference files' literal grep rules, so the audit confirms leads instead of hunting them. [#107](https://github.com/bostonaholic/skills/pull/107)

## [0.35.0] - 2026-10-21

### Changed

- Move `rebasing-open-prs` run setup, the dropped-commit check, result-file writing, and reconcile status derivation into tested scripts, so workers no longer retype commands or parse `range-diff` output. [#106](https://github.com/bostonaholic/skills/pull/106)

## [0.34.0] - 2026-10-21

### Changed

- Run `auditing-repo-security`'s detection greps, dependency scanners, and scoring through scripts, scanning each lockfile on an isolated copy. [#105](https://github.com/bostonaholic/skills/pull/105)

## [0.33.0] - 2026-10-21

### Changed

- Run the preflight, lease, base fetch, and lease-guarded push in `rebasing-branches` through tested scripts, so each refusal and push behaves the same on every run. [#104](https://github.com/bostonaholic/skills/pull/104)

## [0.32.0] - 2026-10-21

### Changed

- Fetch pull-request feedback with a shared `fetch-pr-feedback.mjs` script that paginates every connection and fails loud on an incomplete read, in place of a query each PR skill retyped. [#103](https://github.com/bostonaholic/skills/pull/103)

## [0.31.0] - 2026-10-21

### Changed

- Run `landing-prs`'s pre-push checks, CI gate, and squash-merge through tested scripts that report each outcome as an exit code. [#102](https://github.com/bostonaholic/skills/pull/102)

## [0.30.0] - 2026-10-21

### Changed

- Run `merging-dependabot-prs` analysis, plan rendering, and each merge or rebase comment through tested scripts, leaving breaking-note and usage judgment to the model. [#101](https://github.com/bostonaholic/skills/pull/101)

## [0.29.0] - 2026-10-21

### Changed

- Collect, bound, sort, and render the `summarizing-friction-logs` dashboard with `scripts/collect-friction.mjs`, leaving only the per-entry gists to the model. [#100](https://github.com/bostonaholic/skills/pull/100)

## [0.28.0] - 2026-10-21

### Changed

- Move the save and reset in `redoing-implementations` into `scripts/save-and-reset-attempt.sh`, which checks both saves before resetting only the attempt's files and prints the exact restore commands. [#99](https://github.com/bostonaholic/skills/pull/99)

## [0.27.0] - 2026-10-21

### Changed

- Move the `verifying-production-changes` deploy gate into `scripts/deploy-gate.sh`, which fetches, checks ancestry per sample, self-checks both ways, polls until consecutive clean polls, and prints the bound sentence. [#98](https://github.com/bostonaholic/skills/pull/98)

## [0.26.0] - 2026-10-21

### Added

- Add `choosing-determinism`, a skill that moves each step of an agent skill whose correct result is fixed by its inputs into a script the skill runs, leaving the model only judgment. [#97](https://github.com/bostonaholic/skills/pull/97)

## [0.25.0] - 2026-10-20

### Changed

- Resolve rebase conflicts in `landing-prs` by calling `rebasing-branches`, which is now model-invocable for that call, so a conflicting branch still lands. [#96](https://github.com/bostonaholic/skills/pull/96)

## [0.24.0] - 2026-10-20

### Added

- Add `scripts/install-grok-bot.sh`, which copies the active skills into a Grok Bot skill library and takes `--set strategy` for the non-coding subset, with a Grok Bot section in `INSTALL.md`. [#91](https://github.com/bostonaholic/skills/pull/91)
- Add shared skill call rules so a skill that calls another skill reads that skill's `SKILL.md` in a harness with no Skill tool, linked from every calling skill. [#91](https://github.com/bostonaholic/skills/pull/91)

### Changed

- Rebase a behind branch inside `landing-prs`, decided by a commit count against the fetched base, then push with `--force-with-lease` and land, stopping only when the rebase conflicts. [#95](https://github.com/bostonaholic/skills/pull/95)

## [0.23.0] - 2026-10-20

### Added

- Add `hillclimbing`, a skill that iterates toward a goal one measured change at a time and keeps going until a fresh run of the check proves the completion criteria met. [#94](https://github.com/bostonaholic/skills/pull/94)

## [0.22.1] - 2026-10-20

### Fixed

- Open the `redoing-implementations` approval reply with a 3 to 5 sentence design paragraph, keep every touched file in the tracked or untracked group, and save and reset on a branch with no commits. [#66](https://github.com/bostonaholic/skills/pull/66)

## [0.22.0] - 2026-10-10

### Changed

- Trim `using-gh-cli` to gh CLI gotchas: drop the branch-commit review, the PR body layout, and the landing hand-off, which belong to the repository's PR template and `landing-prs`. [#90](https://github.com/bostonaholic/skills/pull/90)

## [0.21.15] - 2026-10-10

### Fixed

- Make `auditing-tests` keep every unverified or incomplete candidate at **R** instead of reporting it as deletable, and give the render plan when the report cannot be written. [#79](https://github.com/bostonaholic/skills/pull/79)

## [0.21.14] - 2026-10-10

### Fixed

- Load `verifying-production-changes` before reporting whether a merged change is live, including from deploy output already in hand, state the "No stale instance observed" bound verbatim, and limit every claim about what production runs to the sampled requests. [#63](https://github.com/bostonaholic/skills/pull/63)

## [0.21.13] - 2026-10-10

### Fixed

- Require `writing-technical-design-docs` to name an owner and a calendar date for every open question, never TBD. [#61](https://github.com/bostonaholic/skills/pull/61)
- Make `writing-technical-design-docs` run `reviewing-design-docs` before returning a draft, and explain how to run it when it cannot run in the session. [#61](https://github.com/bostonaholic/skills/pull/61)

## [0.21.12] - 2026-10-10

### Fixed

- Stop `composing-agent-prompts` at the printed prompt even when the user asks to run it, instead of dispatching it to an agent. [#77](https://github.com/bostonaholic/skills/pull/77)

## [0.21.11] - 2026-10-10

### Fixed

- Keep the report paths, exclusions, and render command in the `auditing-complexity` reply when the report cannot be written or rendered. [#76](https://github.com/bostonaholic/skills/pull/76)

## [0.21.10] - 2026-10-10

### Fixed

- Make simplifying-ruby-code load for direct Ruby refactor requests by leading its description with the rewrite. [#74](https://github.com/bostonaholic/skills/pull/74)

## [0.21.9] - 2026-10-10

### Fixed

- Have `pricing-creativity` ask for the decision makers, desired future state, its worth, and the budget before giving any figure for a deal, including placeholders and guesses. [#70](https://github.com/bostonaholic/skills/pull/70)

## [0.21.8] - 2026-10-10

### Fixed

- Make `learning-from-mistakes` propose a new `## Learned Rules` section at the approval step when no existing section fits, instead of a made-up heading. [#69](https://github.com/bostonaholic/skills/pull/69)

## [0.21.7] - 2026-10-10

### Fixed

- Stop `summarizing-shipped-work` from summarizing or offering partial results after a failed fetch, and tell the user to rerun after a server error. [#65](https://github.com/bostonaholic/skills/pull/65)

## [0.21.6] - 2026-10-10

### Fixed

- Route a diff already in the conversation to `reviewing-code` instead of an inline review. [#64](https://github.com/bostonaholic/skills/pull/64)

## [0.21.5] - 2026-10-10

### Fixed

- Make `watching-authored-prs` hand off to `/landing-prs` instead of merging when a watch request asks to merge once approved. [#62](https://github.com/bostonaholic/skills/pull/62)

## [0.21.4] - 2026-10-10

### Fixed

- Load `freeing-disk-space` for full-disk requests that ask to empty the Trash or free a target amount of space. [#75](https://github.com/bostonaholic/skills/pull/75)

## [0.21.3] - 2026-10-10

### Changed

- Make `investigating-design-rationale` fire on Sonnet for "why is this code shaped this way" questions, even when commits or PR text are already in context. [#73](https://github.com/bostonaholic/skills/pull/73)

## [0.21.2] - 2026-10-10

### Fixed

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

[0.21.2]: https://github.com/bostonaholic/skills/compare/v0.21.1...v0.21.2

[0.21.3]: https://github.com/bostonaholic/skills/compare/v0.21.2...v0.21.3

[0.21.4]: https://github.com/bostonaholic/skills/compare/v0.21.3...v0.21.4

[0.21.5]: https://github.com/bostonaholic/skills/compare/v0.21.4...v0.21.5

[0.21.6]: https://github.com/bostonaholic/skills/compare/v0.21.5...v0.21.6

[0.21.7]: https://github.com/bostonaholic/skills/compare/v0.21.6...v0.21.7

[0.21.8]: https://github.com/bostonaholic/skills/compare/v0.21.7...v0.21.8

[0.21.9]: https://github.com/bostonaholic/skills/compare/v0.21.8...v0.21.9

[0.21.10]: https://github.com/bostonaholic/skills/compare/v0.21.9...v0.21.10

[0.21.11]: https://github.com/bostonaholic/skills/compare/v0.21.10...v0.21.11

[0.21.12]: https://github.com/bostonaholic/skills/compare/v0.21.11...v0.21.12

[0.21.13]: https://github.com/bostonaholic/skills/compare/v0.21.12...v0.21.13

[0.21.14]: https://github.com/bostonaholic/skills/compare/v0.21.13...v0.21.14

[0.21.15]: https://github.com/bostonaholic/skills/compare/v0.21.14...v0.21.15

[0.22.0]: https://github.com/bostonaholic/skills/compare/v0.21.15...v0.22.0

[0.22.1]: https://github.com/bostonaholic/skills/compare/v0.22.0...v0.22.1

[0.23.0]: https://github.com/bostonaholic/skills/compare/v0.22.1...v0.23.0

[0.24.0]: https://github.com/bostonaholic/skills/compare/v0.23.0...v0.24.0

[0.25.0]: https://github.com/bostonaholic/skills/compare/v0.24.0...v0.25.0

[0.26.0]: https://github.com/bostonaholic/skills/compare/v0.25.0...v0.26.0

[0.27.0]: https://github.com/bostonaholic/skills/compare/v0.26.0...v0.27.0

[0.28.0]: https://github.com/bostonaholic/skills/compare/v0.27.0...v0.28.0

[0.29.0]: https://github.com/bostonaholic/skills/compare/v0.28.0...v0.29.0

[0.30.0]: https://github.com/bostonaholic/skills/compare/v0.29.0...v0.30.0

[0.31.0]: https://github.com/bostonaholic/skills/compare/v0.30.0...v0.31.0

[0.32.0]: https://github.com/bostonaholic/skills/compare/v0.31.0...v0.32.0

[0.33.0]: https://github.com/bostonaholic/skills/compare/v0.32.0...v0.33.0

[0.34.0]: https://github.com/bostonaholic/skills/compare/v0.33.0...v0.34.0

[0.35.0]: https://github.com/bostonaholic/skills/compare/v0.34.0...v0.35.0

[0.36.0]: https://github.com/bostonaholic/skills/compare/v0.35.0...v0.36.0

[0.37.0]: https://github.com/bostonaholic/skills/compare/v0.36.0...v0.37.0

[0.38.0]: https://github.com/bostonaholic/skills/compare/v0.37.0...v0.38.0

[0.39.0]: https://github.com/bostonaholic/skills/compare/v0.38.0...v0.39.0

[0.40.0]: https://github.com/bostonaholic/skills/compare/v0.39.0...v0.40.0

[0.41.0]: https://github.com/bostonaholic/skills/compare/v0.40.0...v0.41.0

[0.42.0]: https://github.com/bostonaholic/skills/compare/v0.41.0...v0.42.0

[0.43.0]: https://github.com/bostonaholic/skills/compare/v0.42.0...v0.43.0

[0.44.0]: https://github.com/bostonaholic/skills/compare/v0.43.0...v0.44.0

[0.45.0]: https://github.com/bostonaholic/skills/compare/v0.44.0...v0.45.0

[0.46.0]: https://github.com/bostonaholic/skills/compare/v0.45.0...v0.46.0

[0.47.0]: https://github.com/bostonaholic/skills/compare/v0.46.0...v0.47.0

[0.48.0]: https://github.com/bostonaholic/skills/compare/v0.47.0...v0.48.0

[0.49.0]: https://github.com/bostonaholic/skills/compare/v0.48.0...v0.49.0

[0.50.0]: https://github.com/bostonaholic/skills/compare/v0.49.0...v0.50.0

[0.51.0]: https://github.com/bostonaholic/skills/compare/v0.50.0...v0.51.0

[0.52.0]: https://github.com/bostonaholic/skills/compare/v0.51.0...v0.52.0

[0.53.0]: https://github.com/bostonaholic/skills/compare/v0.52.0...v0.53.0

[0.53.1]: https://github.com/bostonaholic/skills/compare/v0.53.0...v0.53.1

[0.53.2]: https://github.com/bostonaholic/skills/compare/v0.53.1...v0.53.2

[0.53.3]: https://github.com/bostonaholic/skills/compare/v0.53.2...v0.53.3

[0.54.0]: https://github.com/bostonaholic/skills/compare/v0.53.3...v0.54.0

[0.55.0]: https://github.com/bostonaholic/skills/compare/v0.54.0...v0.55.0

[0.56.0]: https://github.com/bostonaholic/skills/compare/v0.55.0...v0.56.0

[0.57.0]: https://github.com/bostonaholic/skills/compare/v0.56.0...v0.57.0

[0.58.0]: https://github.com/bostonaholic/skills/compare/v0.57.0...v0.58.0

[0.59.0]: https://github.com/bostonaholic/skills/compare/v0.58.0...v0.59.0

[0.60.0]: https://github.com/bostonaholic/skills/compare/v0.59.0...v0.60.0

[0.61.0]: https://github.com/bostonaholic/skills/compare/v0.60.0...v0.61.0

[0.62.0]: https://github.com/bostonaholic/skills/compare/v0.61.0...v0.62.0

[0.63.0]: https://github.com/bostonaholic/skills/compare/v0.62.0...v0.63.0

[0.63.1]: https://github.com/bostonaholic/skills/compare/v0.63.0...v0.63.1

[0.64.0]: https://github.com/bostonaholic/skills/compare/v0.63.1...v0.64.0

[0.65.0]: https://github.com/bostonaholic/skills/compare/v0.64.0...v0.65.0

[0.65.1]: https://github.com/bostonaholic/skills/compare/v0.65.0...v0.65.1

[0.66.0]: https://github.com/bostonaholic/skills/compare/v0.65.1...v0.66.0

[0.67.0]: https://github.com/bostonaholic/skills/compare/v0.66.0...v0.67.0

[0.68.0]: https://github.com/bostonaholic/skills/compare/v0.67.0...v0.68.0

[0.69.0]: https://github.com/bostonaholic/skills/compare/v0.68.0...v0.69.0

[0.70.0]: https://github.com/bostonaholic/skills/compare/v0.69.0...v0.70.0

[0.71.0]: https://github.com/bostonaholic/skills/compare/v0.70.0...v0.71.0

[0.72.0]: https://github.com/bostonaholic/skills/compare/v0.71.0...v0.72.0

[0.72.1]: https://github.com/bostonaholic/skills/compare/v0.72.0...v0.72.1

[Unreleased]: https://github.com/bostonaholic/skills/compare/v0.73.0...HEAD
[0.73.0]: https://github.com/bostonaholic/skills/compare/v0.72.1...v0.73.0
