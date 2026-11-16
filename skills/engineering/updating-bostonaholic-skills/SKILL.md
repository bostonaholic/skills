---
name: updating-bostonaholic-skills
description: Updates the bostonaholic skills plugin installs (Claude Code, Codex, the Cursor plugin clone) and the skill copies in the Antigravity, OpenCode, Cursor, and Grok Bot skill directories to the latest release tag in one run, then removes retired skill copies and old backups. Use when the user explicitly asks to update the bostonaholic skills. Never infer from an outdated skill or a version mismatch. Not for installing; use INSTALL.md.
disable-model-invocation: true
---

# Updating bostonaholic skills

Brings each existing install up to the latest release in one run, then cleans
up. The user asking is the confirmation: never ask again before running. It
never installs into a harness that lacks the collection, and never adds a
skill to a copy directory that did not hold it.

`<skill-dir>` is this skill's directory. The script needs `node` and `git`
(check with `command -v node git`); it uses `claude` and `codex` where installed.

## Rules

- **Run, don't ask.** `run` prints the plan, runs every step, and verifies.
- **Stop at blockers.** Exit 4 means a harness needs the user's action first;
  nothing ran.
- **Refreshed:** the Claude Code and Codex plugins, the Cursor plugin clone
  (`git pull --ff-only` on its own branch, not the release tag), and any
  collection-named real copy in `~/.gemini/antigravity-cli/skills`,
  `${XDG_CONFIG_HOME:-~/.config}/opencode/skills`, `~/.cursor/skills`, and
  `~/agent-data/workflows`, whatever installed it.
- **Cleaned up:** skills the collection retired, in those copy directories and
  in `~/.claude/skills` and `~/.agents/skills` (a symlink is unlinked, its
  target kept), and the backups directory once every step ran.
- **Not refreshed:** current collection skills in `~/.claude/skills`,
  `~/.agents/skills`, and project-level `skills` CLI installs. Point the user
  at the update command in INSTALL.md's "One skill" section.

## Steps

- Run `node "<skill-dir>/scripts/update.mjs" run` and show its whole output.
  For a preview the user asked for, prefix `DRY_RUN=true`; it changes nothing.
  - Exit 4: report each `Blocked` line, say what
    [blockers and failures](references/blockers-and-failures.md) advises, stop.
  - Exit 1: report the stderr (a failed step and the steps not run, or a step
    still planned after the run, such as a marketplace serving an older
    version than the release) and what the reference advises; do not retry
    blindly.
- Report each step run, each `left:` line, and the `Verified` line.
- Tell the user which harnesses to restart:
  - Claude Code: a new session, or `/reload-plugins`.
  - Codex: a new thread.
  - Antigravity, OpenCode, Cursor (plugin and skills): restart the app.
  - Grok Bot: no restart is documented; confirm under Settings > Plugins > Yours.
