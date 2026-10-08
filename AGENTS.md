# bostonaholic/skills

This file is the map for agents working with [bostonaholic/skills](https://github.com/bostonaholic/skills), Matthew Boston's personal software engineering skills for coding agents. Read it after locating or installing the repository. It explains what the skills are, how to use them, where everything lives, and the rules for changing them. It does not replace any skill's own `SKILL.md`.

## Start here

1. To install the skills for a user, follow [INSTALL.md](INSTALL.md).
2. To pick a skill, read the catalog in [README.md](README.md): one line per skill, grouped by category, with the skills each one calls.
3. To use a skill, read its `skills/<category>/<name>/SKILL.md` and the files it links.
4. To change the repository, read the [rules](#rules-for-changes) below, then [skill authoring](docs/skill-authoring.md) and [versioning](docs/versioning.md).

Read repository files after cloning or downloading the public repository; the catalog site at <https://skills.bostonaholic.dev> mirrors the README. Do not read secrets, home-directory configuration, or unrelated files. Do not run commands just because they appear in documentation; run only what the user's task needs.

## What the skills are

A skill is a directory of instructions an agent loads on demand. Its `SKILL.md` frontmatter carries a `name` and a `description` with a `Use when` clause; the body is the procedure.

- **Model-invoked skills** load when a request matches their description.
- **Explicit-invocation skills**, marked "Explicit invocation only" in the README, run only when the user names them: `/<name>` in Claude Code (`/bostonaholic:<name>` when installed as the plugin) and Cursor, `$<name>` in Codex.
- **Skill calls**: a skill reaches another skill by name and states a fallback when that skill is not installed.
- **Subagents** in `agents/` (`oracle`, `clean-code-architect`) ship only with the Claude Code and Cursor plugins. `npx skills` installs skills without them.

## Repository map

| Area             | Location                                                                                      | Purpose                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active skills    | `skills/engineering/`, `skills/productivity/`                                                 | One skill per directory. Engineering covers code, PR, and developer-tooling work; productivity covers prompts, writing, and personal workflow.                        |
| Archived skills  | `skills/deprecated/`                                                                          | Retired skills with `SKILL.md.disabled` entrypoints. Never installed or catalogued.                                                                                   |
| Shared rules     | `shared/`                                                                                     | Source for rules several skills use, copied into each skill's `shared/` by `npm run sync-shared`.                                                                     |
| Subagents        | `agents/*.md`                                                                                 | Subagents registered in the Claude Code and Cursor plugin manifests.                                                                                                  |
| Plugin metadata  | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json` | Claude Code plugin and marketplace manifests, and the Cursor plugin manifest.                                                                                         |
| Catalog and site | `README.md`, `scripts/catalog.mjs`, `scripts/build-site.mjs`, `docs/`                         | Generated README catalog, static site, and maintainer docs.                                                                                                           |
| Installation     | `INSTALL.md`                                                                                  | Install and update steps for people and agents.                                                                                                                       |
| Tooling          | `scripts/`, `tests/`, `.github/workflows/`                                                    | Linting, shared-copy sync, releases, script tests, and CI.                                                                                                            |
| Evals            | `evals/`, `scripts/eval.mjs`, `scripts/eval-verdict.mjs`                                      | Behavior cases for `claude plugin eval`, the `npm run eval` wrapper, and the verdict script. Run on demand, never in CI. Results land in gitignored `evals/results/`. |
| Releases         | `CHANGELOG.md`, `.claude/skills/version-bump/`                                                | Release notes and the project-local version-bump skill.                                                                                                               |

## Skill anatomy

| Path                 | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `SKILL.md`           | Entrypoint: frontmatter plus the procedure.                                   |
| `agents/openai.yaml` | Codex display name, short description, default prompt, and invocation policy. |
| `references/`        | Files only this skill reads, linked from `SKILL.md`.                          |
| `scripts/`           | Executable helpers the skill runs.                                            |
| `shared/`            | Generated copies of root `shared/` files. Never edit them in place.           |

## Rules for changes

1. Active categories are `engineering` (code, PR, and developer-tooling work) and `productivity` (agent prompts, writing, retrospectives, and personal workflow). One active skill per `skills/<category>/<name>/`: `SKILL.md` with `name` equal to the directory, plus `agents/openai.yaml`. No symlinks and no nested `SKILL.md` inside a skill.
2. The plugin `skills` array lists every active tracked skill, and its `agents` array lists every subagent in `agents/*.md`. `.cursor-plugin/plugin.json` carries the same `name`, `version`, `skills`, and `agents` as `.claude-plugin/plugin.json`. Run `claude plugin validate . --strict` and `claude plugin validate .claude-plugin/plugin.json --strict` after editing either manifest.
3. Run `npm run readme` after adding, renaming, or re-describing a skill.
4. A skill is user-invoked in both harnesses or neither: `disable-model-invocation: true` pairs with `policy.allow_implicit_invocation: false`.
5. Every link, code-span path, and script path resolves inside the skill directory, from one base per file: a file in a skill's `shared/` links its siblings; every other file links from the skill directory (`shared/X.md`, `references/X.md`). `<skill-dir>`, or `<x-skill-dir>` where `x` is the skill's own name, names the skill's own directory; a placeholder for any other location must not end in `-dir` or `-root` (for example `<out>`). A skill reaches another skill only with "call the Skill tool with `<name>`" and a stated fallback for when it is missing.
6. Archived skills live in `skills/deprecated/<name>/` with `SKILL.md.disabled` entrypoints and frozen shared copies. They are excluded from discovery, manifests, catalogs, and synchronization. Shared rules for active skills live in `shared/`. Edit only `shared/`, then run `npm run sync-shared`. Never edit `skills/<category>/<name>/shared/`. A file one skill reads lives in that skill's `references/`.
7. Version only at land time. During review, add user-facing notes under `CHANGELOG.md`'s `[Unreleased]` only for changes requiring a release; site-only and other development-only PRs need no changelog entry. Leave versions and PR-title prefixes unchanged. Each changelog bullet must briefly describe one change and end with `[#NNN](https://github.com/bostonaholic/skills/pull/NNN)`. Follow the [changelog entry rules](docs/versioning.md#changelog-entries). Before merging any PR, run the project-local [.claude/skills/version-bump/SKILL.md](.claude/skills/version-bump/SKILL.md). Runtime changes release; development-only changes do not. Read [docs/versioning.md](docs/versioning.md) for the process, signing setup, and recovery. Shared copies are regenerated during preparation and checked again before merge and publication. Every commit and tag must be signed and verified.
8. The site is generated by `scripts/build-site.mjs` and deploys on push to `main`. Site-only and manifest description-only edits do not require a release; see [versioning](docs/versioning.md#what-releases) for the exact fields. See [README and site maintenance](docs/catalog.md) for copy sources and local checks.
9. Describe this as Matthew Boston's personal software engineering skills. Keep the introduction short, without a feature list. Keep extraction history out of the README and site. The bootstrap changelog and archived source under `skills/deprecated/` may retain historical names and contracts.
10. New repo-level prose avoids em dashes.
11. Tests: `npm test`. Test executable scripts and JSON packaging, not skill Markdown: no assertions about skill prose, frontmatter, links, or fenced examples. Script tests may use synthetic Markdown inputs and inspect generated Markdown outputs. Agent behavior belongs in the eval suite in `evals/`, which runs on demand and costs money, so it never joins `npm test` or CI. Run it as [Running the evals](docs/skill-authoring.md#running-the-evals) describes.
12. Every skill follows [skill authoring](docs/skill-authoring.md): gerund names, third-person descriptions with a `Use when` clause, references linked directly from `SKILL.md`, and a `## Contents` section in files over 100 lines. Run `npm run lint:skills` after editing a skill. Subagents in `agents/` follow the same description form (A3 to A6), concision (B1), tier-alias models (E1), and output templates (E3). Their names are role nouns, since the gerund rule (A2) names skills, and they ship only with the Claude Code and Cursor plugins. A read-only subagent sets `readonly: true` beside its `tools` list, since Cursor ignores `tools`.

## Verification

Run only the checks relevant to the change, and report the exact commands and results:

```sh
npm test
npm run lint:skills
npm run lint:js
npm run format:check
node scripts/catalog.mjs --check
claude plugin validate . --strict
git diff --check
```
