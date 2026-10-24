# Claude plugin directory

This file records how the `bostonaholic` plugin meets the Claude plugin
directory's pre-submission checklist. It lists the values to enter in the
portal, the status of each checklist row, the holds and warnings we expect, and
how to fix a new finding. Update a row when its status changes.

## Portal values

- Repository: `bostonaholic/skills`.
- Plugin path: empty. The plugin folder is the repository root, which holds
  `.claude-plugin/plugin.json`.
- Branch or tag: empty. The directory then tracks the default branch, `main`.

Once the plugin is listed, the directory validates and scans each new commit on
`main`.

## Checklist rows

| Row                                                             | Status                        |
| --------------------------------------------------------------- | ----------------------------- |
| Folder holds `.claude-plugin/plugin.json`                       | Met                           |
| One plugin per submission                                       | Met                           |
| Component paths stay inside the plugin folder                   | Met                           |
| No symlinks, submodules, or LFS pointers                        | Warning for `CLAUDE.md`, kept |
| No `.DS_Store`, `Thumbs.db`, `desktop.ini`, or `__MACOSX`       | Met                           |
| Valid names, no case collisions, no non-ASCII                   | Met                           |
| No `export-ignore`, `export-subst`, or `filter` attributes      | Met                           |
| Archive, entry, and file size limits                            | Met                           |
| `name` is valid, distinctive, and not reserved                  | Portal only                   |
| `name`, `displayName`, and `author.name` match no known brand   | Portal only                   |
| `description`, `author`, and `version` set                      | Met                           |
| README of at least 40 words outside code blocks                 | Met                           |
| `LICENSE` file or `license` field                               | Met                           |
| Each non-image, non-font file under 256 KiB                     | Met                           |
| Plugin of 512 files or fewer                                    | Held, kept                    |
| Only text, SVG, complete images, and fonts                      | Met                           |
| No `.mcp.json`, hooks, MCP servers, or LSP servers              | Not applicable                |
| Launchers such as `npx` and `uvx` are pinned                    | Held, kept                    |
| No package-manager configuration                                | Met                           |
| No real credentials, none read from the environment             | Met                           |
| Dependencies install from a lockfile                            | Met                           |
| Hook and MCP scripts the validator can follow                   | Not applicable                |
| Component front matter is valid                                 | Met                           |
| Security scan: the README states what the plugin runs and sends | Met                           |

The portal alone decides the two "Portal only" rows. `name` is `bostonaholic`,
`author.name` is `Matthew Boston`, and no `displayName` is set. The plugin has
no hooks or MCP servers, so the validator has no hook or MCP script to follow.

Run these commands from the repository root to see each status. A comment names
the row and the output that shows it.

```sh
# Folder holds .claude-plugin/plugin.json: prints the path.
git ls-files .claude-plugin/plugin.json
# One plugin per submission: prints one entry, 'bostonaholic ./'.
node -p "require('./.claude-plugin/marketplace.json').plugins.map((p) => p.name + ' ' + p.source)"
# Component paths stay inside the plugin folder: prints [].
node -p "const m = require('./.claude-plugin/plugin.json'); [...m.skills, ...m.agents].filter((p) => !p.startsWith('./') || p.includes('..'))"
# Symlinks: prints one line, for CLAUDE.md, the expected warning.
git ls-files -s | awk '$1 == "120000"'
# No submodules: prints nothing.
git ls-files -s | awk '$1 == "160000"'
# No LFS pointers and no export-ignore, export-subst, or filter attributes: prints nothing.
git ls-files .gitattributes '**/.gitattributes'
# No .DS_Store, Thumbs.db, desktop.ini, or __MACOSX: prints nothing.
git ls-files | grep -E '(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX)(/|$)'
# No case collisions, then no non-ASCII names: each prints nothing.
git ls-files | tr '[:upper:]' '[:lower:]' | sort | uniq -d
git ls-files -z | tr '\0' '\n' | LC_ALL=C grep '[^ -~]'
# Archive under 50 MiB: prints a byte count.
git archive HEAD | wc -c
# Entry count (under 10,000) and the 512-file row: prints more than 512.
git ls-files | wc -l
# Largest file, under 256 KiB: the line above the total.
git ls-files -z | xargs -0 wc -c | sort -n | tail -2
# description, author, and version set: prints three values.
node -p "const m = require('./.claude-plugin/plugin.json'); [m.description, m.author.name, m.version]"
# LICENSE file: prints the path. plugin.json also sets "license": "MIT".
git ls-files LICENSE
# Only text files: prints 0.
git ls-files -z | xargs -0 file --mime-encoding | grep -c binary
# No MCP, LSP, or hook files, and no package-manager configuration: prints nothing.
git ls-files .mcp.json .lsp.json hooks .npmrc bunfig.toml uv.toml
# Launchers in loaded files: prints the three pinned lines of the pinned-launcher hold.
git grep -n -w -E 'npx|bunx|uvx|pnpm dlx|yarn dlx|pipx run|uv run' -- skills/engineering skills/productivity agents
# No token read from the environment: prints nothing.
rg -n 'GITHUB_TOKEN|GH_TOKEN' skills agents
# No root lockfile: prints nothing. tests/plugin-manifest.test.mjs fails if one comes back.
git ls-files package-lock.json npm-shrinkwrap.json bun.lock bun.lockb
# Manifests and component front matter: each prints "Validation passed".
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
```

The README section "What the skills run and send" answers the security scan.
See [Keep the README section current](#keep-the-readme-section-current).

The npm development tools live in `tools/`, so the repository root holds no
lockfile. On 2026-10-24, a Claude Code install from a clone of the branch that
moved them held no `node_modules/`, at the cache root or under `tools/`. The
commit before the move held 86 entries in `node_modules/` at the cache root.

## Expected holds and warnings

Validate reports these results, and none stops submission.

- A Policy hold on the 512-file row. `evals/`, `tests/`, and
  `skills/deprecated/` stay in the repository. `claude plugin eval .` needs
  `evals/` inside the plugin root, and `updating-bostonaholic-skills` reads
  `skills/deprecated/` in each release tag. A reviewer reads each new listing
  and, by default, each new version, so the hold adds little delay.
- A Policy hold, "Runs a pinned npx or uvx package". The checklist holds a
  pinned launcher for a reviewer even when the plugin meets every other check.
  Three lines in loaded files run one:
  `skills/engineering/drawing-mermaid-diagrams/SKILL.md:30`,
  `skills/engineering/diagnosing-react-code/SKILL.md:29`, and `:34`. Running
  react-doctor is the purpose of `diagnosing-react-code`. The mermaid-cli line
  is the render step of `drawing-mermaid-diagrams`, and its removal changes
  skill behavior. Each runs an exact version. Keep the pins.
- A Warning for the `CLAUDE.md` symlink. `CLAUDE.md` links to `AGENTS.md`. The
  checklist rates a symlink that the plugin does not load as a Warning. The
  local validator states that the plugin does not load a root `CLAUDE.md`. A
  Warning does not stop submission or hold a version for a reviewer.

Keep the symlink. Do not replace it with a regular file to clear the Warning. A
regular root `CLAUDE.md` fails both strict validate commands, which `AGENTS.md`
rule 2 requires. With a regular `CLAUDE.md` that holds `@AGENTS.md`, each strict
validate command prints these lines, with README advice before the last line:

```text
⚠ Found 1 warning:

  ❯ root: CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.

✘ Validation failed (--strict treats warnings as errors)
```

## Facts that reopen a decision

The plugin stays at the repository root. Look at the layout again when one of
these facts becomes true:

- Anthropic applies auto-publish, and the 512-file hold is the last reason that
  versions wait. Then publish a runtime-only tree to a separate branch and track
  that branch.
- The security scan rejects a version because of eval or test fixtures, even
  with the README disclosure. Then publish a runtime-only branch.
- The portal counts only the files the plugin loads. Then the root passes the
  512-file row, and nothing more needs doing.
- Every user runs an updater that does not read the root layout. Then moving
  the plugin into a subfolder costs less.

`CLAUDE.md` stays a symlink to `AGENTS.md`. Look at it again when one of these
facts becomes true:

- Validate rates the symlink Blocking or holds it. Then move the import to
  `.claude/CLAUDE.md`, which holds `@../AGENTS.md`, and change the
  `learning-from-mistakes` resolver to read it. The resolver is in a shipped
  skill, so use the runtime procedure in [Fix a new finding](#fix-a-new-finding).
- The local validator stops warning on a regular root `CLAUDE.md`. Then a file
  that holds `@AGENTS.md` clears the Warning with no skill change.
- The resolver gets `.claude/CLAUDE.md` support for another reason. Then the
  `.claude/CLAUDE.md` option needs no skill change here.

## Launchers outside the loaded files

The plugin loads the skill directories that `.claude-plugin/plugin.json` lists
under `skills/engineering/` and `skills/productivity/`, and `agents/oracle.md`.
Launchers in other files stay as they are. To list them, run:

```sh
git grep -n -w -E 'npx|bunx|uvx|pnpm dlx|yarn dlx|pipx run|uv run' -- ':!skills/engineering/' ':!skills/productivity/' ':!agents/'
```

If Validate flags a line in one of these groups, make its fallback edit with the
development-only procedure below.

| Group                                     | Files                                                                                                                                                                                                       | Fallback edit                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npx skills@latest` commands              | `INSTALL.md`, `scripts/catalog.mjs` (`NPX_ADD_SKILL`, which only the site reads), `skills/deprecated/reviewing-rails-code/SKILL.md.disabled`, and `skills/deprecated/reviewing-ruby-code/SKILL.md.disabled` | Pin `skills@<exact version>` in `INSTALL.md` and `scripts/catalog.mjs`. Reword the two archived lines. |
| Unpinned commands in fixtures             | `evals/engineering/drawing-mermaid-diagrams/drawing-mermaid-diagrams-guard/graders/rubric.md`, and two fixture strings in `tests/paparazzi.test.mjs`                                                        | Quote the pinned mermaid command in the rubric. Change the fixture error text, then run `npm test`.    |
| `uv run` with no `--locked` or `--frozen` | `.github/workflows/lint.yml` and `docs/skill-authoring.md`                                                                                                                                                  | Add the flag and the lockfile it needs.                                                                |
| `npx skills` named with no command        | `INSTALL.md`, `AGENTS.md`, `docs/versioning.md`, and `CHANGELOG.md`                                                                                                                                         | Reword to "the `skills` CLI". The changelog edit rewrites one history bullet.                          |
| Pinned, or no package named               | The `uvx` lines in `.github/workflows/lint.yml`, files under `evals/engineering/diagnosing-react-code/`, and `docs/directory.md`                                                                            | None.                                                                                                  |

## Fix a new finding

A file outside `skills/engineering/`, `skills/productivity/`, and `agents/`
that is not a manifest is development-only. For a finding in such a file:

1. Open one PR with the edits and no changelog bullet.
2. At land, the version-bump skill reports `runtime: false`. No version
   changes, and the title stays a plain conventional title.
3. After the squash-merge, select Re-validate on the portal's Source step.

For a Blocking finding in a file the plugin loads:

1. Add an `[Unreleased]` bullet to the fix PR, as
   [versioning and releases](versioning.md#changelog-entries) describes.
2. At land, the version-bump skill runs `release:prepare`, makes a signed
   `chore(version): X.Y.Z` commit, runs `release:check`, and sets the
   `vX.Y.Z` title.
3. After the squash-merge, `release-on-merge.yml` pushes the signed tag and the
   GitHub release.
4. Select Re-validate.

## Keep the README section current

The security scan reads the README section "What the skills run and send". A PR
that changes a shipped skill's commands, network destinations, uploads, or
writes outside the working repository updates that section before it merges
(`AGENTS.md` rule 13).
