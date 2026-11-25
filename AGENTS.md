# bostonaholic/skills

This file is the map for agents working with [bostonaholic/skills](https://github.com/bostonaholic/skills), Matthew Boston's personal software engineering skills for coding agents. Read it after locating or installing the repository. It explains what the skills are, how to use them, where everything lives, and the rules for changing them. It does not replace any skill's own `SKILL.md`.

## Start here

1. To install the skills for a user, follow [INSTALL.md](INSTALL.md).
2. To pick a skill, read the catalog in [README.md](README.md): a table per category with one row per skill and what can invoke it (user, model, or another skill).
3. To use a skill, read its `skills/<category>/<name>/SKILL.md` and the files it links.
4. To change the repository, read the [rules](#rules-for-changes) below, then [skill authoring](docs/skill-authoring.md) and [versioning](docs/versioning.md).
5. To see where the collection is going and why skills compose, read [VISION.md](VISION.md).

Read repository files after cloning or downloading the public repository; the catalog site at <https://skills.bostonaholic.dev> mirrors the README. Do not read secrets, home-directory configuration, or unrelated files. Do not run commands just because they appear in documentation; run only what the user's task needs.

When documentation, this file included, disagrees with what the code does now, never take the document's word for the code's behavior. Decide which side is wrong as [docs and code](shared/docs-vs-code.md) says: a failing test and a code fix when the docs state intended behavior, a docs fix when they misdescribe behavior the code and its tests agree on, and a question to the user when the evidence does not settle it. Text that says what a change must do, such as the [rules](#rules-for-changes) below, still binds.

## What the skills are

A skill is a directory of instructions an agent loads on demand. Its `SKILL.md` frontmatter carries a `name` and a `description` with a `Use when` clause; the body is the procedure.

- **Model-invoked skills** load when a request matches their description. Each description's `Use when` clause starts with `Use when the user says "<phrase>"`, and that phrase is shown in the README's Say column.
- **Explicit-invocation skills**, shown with a slash command in the README's Say column, run only when the user names them: `/<name>` in Claude Code (`/bostonaholic:<name>` when installed as the plugin), Cursor, and Grok Bot, `$<name>` in Codex.
- **Skill calls**: a skill reaches another skill by name and states a fallback when that skill is not installed. A harness with no Skill tool, such as Grok Bot, reads the called skill's `SKILL.md` instead, as `shared/skill-calls.md` says.
- **Subagents** in `agents/` (`oracle`) ship only with the Claude Code and Cursor plugins. `npx skills` installs skills without them.

## Repository map

| Area              | Location                                                                                                                 | Purpose                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active skills     | `skills/engineering/`, `skills/productivity/`                                                                            | One skill per directory. Engineering covers code, PR, and developer-tooling work; productivity covers prompts, writing, and personal workflow.                                                                                                                                                                              |
| Incubating skills | `skills/incubating/`                                                                                                     | Unshipped ideas the maintainer invokes by hand to try out. Never installed or catalogued.                                                                                                                                                                                                                                   |
| Archived skills   | `skills/deprecated/`                                                                                                     | Retired skills with `SKILL.md.disabled` entrypoints. Never installed or catalogued.                                                                                                                                                                                                                                         |
| Shared rules      | `shared/`                                                                                                                | Source for rules several skills use, and for the scripts in `shared/scripts/` they run, copied into each skill's `shared/` by `npm run sync-shared`.                                                                                                                                                                        |
| Subagents         | `agents/*.md`                                                                                                            | Subagents registered in the Claude Code and Cursor plugin manifests.                                                                                                                                                                                                                                                        |
| Plugin metadata   | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.claude-plugin/icon.png`, `.cursor-plugin/plugin.json` | Claude Code plugin and marketplace manifests, the Claude Code listing icon, and the Cursor plugin manifest.                                                                                                                                                                                                                 |
| Catalog and site  | `README.md`, `scripts/catalog.mjs`, `scripts/build-site.mjs`, `docs/`                                                    | Generated README catalog, static site, and maintainer docs.                                                                                                                                                                                                                                                                 |
| Installation      | `INSTALL.md`, `scripts/install-grok-bot.sh`                                                                              | Install and update steps for people and agents, and the Grok Bot copy installer.                                                                                                                                                                                                                                            |
| Tooling           | `scripts/`, `tests/`, `tools/`, `.github/workflows/`                                                                     | Linting, shared-copy sync, releases, script tests, CI, and the pinned development tools in `tools/` (markdownlint-cli2, oxfmt, oxlint).                                                                                                                                                                                     |
| Evals             | `evals/`, `scripts/eval.mjs`, `scripts/eval-verdict.mjs`, `scripts/eval-compare.mjs`, `scripts/eval-handoff.mjs`         | Behavior cases for `claude plugin eval`, the `npm run eval` wrapper, the verdict script, the cost and pass rate comparison, and the `npm run eval:handoff` handoff eval, and `scripts/select-evals.mjs`, which picks a pull request's cases for `.github/workflows/evals.yml`. Results land in gitignored `evals/results/`. |
| Releases          | `CHANGELOG.md`, `.claude/skills/version-bump/`                                                                           | Release notes and the project-local version-bump skill.                                                                                                                                                                                                                                                                     |

## Skill anatomy

| Path                 | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `SKILL.md`           | Entrypoint: frontmatter plus the procedure.                                   |
| `agents/openai.yaml` | Codex display name, short description, default prompt, and invocation policy. |
| `references/`        | Files only this skill reads, linked from `SKILL.md`.                          |
| `scripts/`           | Executable helpers the skill runs.                                            |
| `shared/`            | Generated copies of root `shared/` files. Never edit them in place.           |

## Rules for changes

Every rule a command can check lives in that check, not here: `npm test`, `npm run lint:skills`, `npm run lint:repo`, the workflows in `.github/workflows/`, and the Claude Code hook in `.claude/settings.json`, which blocks edits to generated `shared/` copies. CI runs them, and each failure names its fix. The rules below need judgment.

1. Active skills go in `engineering` (code, PR, and developer-tooling work) or `productivity` (agent prompts, writing, reflection, and personal workflow). Incubating skills need no eval cases; to try one in another repository, symlink its directory into your user skills directory.
2. Every skill call states a fallback for when the called skill is not installed ([B5](docs/skill-authoring.md#b-concision-and-freedom)), and a code-span path without `<skill-dir>/` still resolves inside the skill ([C7](docs/skill-authoring.md#c-structure-and-progressive-disclosure)).
3. Archived skills in `skills/deprecated/` keep frozen shared copies. A file one skill reads lives in that skill's `references/`.
4. Version only at land time. During review, add user-facing notes under `CHANGELOG.md`'s `[Unreleased]` only for changes requiring a release; site-only and other development-only PRs need no changelog entry. Leave versions and PR-title prefixes unchanged. Each changelog bullet briefly describes one change and links this PR; follow the [changelog entry rules](docs/versioning.md#changelog-entries). Before merging any PR, run the project-local [.claude/skills/version-bump/SKILL.md](.claude/skills/version-bump/SKILL.md). Read [docs/versioning.md](docs/versioning.md) for what releases, signing setup, and recovery.
5. Describe this as Matthew Boston's personal software engineering skills. Keep the introduction short, without a feature list. Keep extraction history out of the README and site. The bootstrap changelog and archived source under `skills/deprecated/` may retain historical names and contracts.
6. New repo-level prose avoids em dashes.
7. Tests follow these rules:
   1. Unit-test a script only when it makes a decision: it picks, gates, ranks, parses external data, or deletes, merges, or pushes. A thin wrapper over git, gh, or the filesystem gets no test. It fails loudly, and evals exercise it.
   2. Assert the decision, not the wording: exit codes, JSON fields, which item was chosen. Not human-facing strings or layout, unless the output is machine-read.
   3. One test per cross-script rule: a check that every script must pass, such as the entry guard or the `see <path>` pointer, lives in one table-driven test. Per-script files do not repeat it.
   4. On-demand tooling gets safety tests only: the eval runner's tests cover that it never starts `claude` outside the npm eval scripts, plus the verdict and comparison rules that gate evals in CI.
   5. Repository invariants are tests: manifests agree, generated files are current, release tags are signed, links resolve.
   6. Agent behavior is tested by evals in `evals/`, never by unit tests or assertions about skill prose, frontmatter, links, or fenced examples. Script tests may use synthetic Markdown inputs and inspect generated Markdown outputs. Run evals locally as [Running the evals](docs/skill-authoring.md#running-the-evals) describes.
   7. Lint checks structure, never prose.
   8. Code that sets `npm_lifecycle_event`, spawns `npm run eval`, `npm run eval:handoff`, or `claude` itself, or passes the real `claude` to `runHandoff` gets review: the eval guards cannot see it.
8. Every skill follows [skill authoring](docs/skill-authoring.md): it tells the model what the author cares about, then stays out of its way, holding only what a frontier model would otherwise get wrong. The core rules come first: agent-agnostic (B3) and a short prompt (C1, C6). Rows marked **lint** are checked; every other row needs review. Subagents in `agents/` follow the description rows (A3 to A6), B1, E3, and [S1 to S4](docs/skill-authoring.md#subagents).
9. Every PR updates the documentation its change makes stale before it merges: this file, `INSTALL.md`, `docs/`, the skill's own `SKILL.md` and references, eval graders that cite changed lines, the README section "What the skills run and send" when a shipped skill's commands, network destinations, uploads, or writes outside the working repository change, and `CHANGELOG.md` per rule 4. Check the PR body's documentation box only once the docs match, or note why none were needed.
10. Prose never states how many members a set has when this repository or the change defines the set. Write "every skill", "these steps", or the members' names, never "51 skills" or "four steps". The number goes stale when the set changes, and it tells the reader nothing the list does not. Test each number: does adding or removing one member make it wrong? If yes, rewrite the sentence. Positional counts ("the last two") and ordinals that count a set ("a fourth condition") fail the test too. Numbers stay for limits and defaults the reader obeys, IDs such as step numbers and exit codes, and values a script enforces. They also stay for facts about outside sources, records of past runs and published releases, and script output. A fixed split into X and not-X ("tracked and untracked") is not a count. Code, fixtures, test data, and quoted text stay byte-identical. The rule covers docs, skills and their references, manifests, new changelog entries, and PR bodies.
11. Every skill passage that starts a subagent says to start it with fresh context, never a fork of the parent conversation ([D6](docs/skill-authoring.md#d-workflows-and-feedback-loops)). Some harnesses fork the parent conversation by default, and a fork inherits the context the subagent exists to escape.

## Verification

Install the development tools once per checkout with `npm ci --prefix tools`.

Run only the checks relevant to the change, and report the exact commands and results:

```sh
npm test
npm run lint:skills
npm run lint:repo
npm run lint:js
npm run format:check
node scripts/catalog.mjs --check
claude plugin validate . --strict
git diff --check
```
