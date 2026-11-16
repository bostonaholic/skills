# Blockers and failures

Read this when `update.mjs` exits 1 or 4, or prints a `Blocked` or `left:` line.

## Contents

- Exit codes
- Blockers
- Failed steps
- Left lines
- Backups

## Exit codes

| Code | Meaning                                                                           | Next                                               |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0    | Plan printed, or every step ran and verified                                      | Report the steps and `left:` lines                 |
| 1    | A step failed or is still planned after the run, or the release could not be read | Report the stderr; fix the cause, then `run` again |
| 2    | Usage: bad arguments                                                              | Pass `run` or `plan`                               |
| 4    | The plan is blocked                                                               | Resolve each `Blocked` line, then `run` again      |

## Blockers

Nothing runs while any blocker stands, in any harness.

- **`claude CLI is not on PATH`** or **`codex CLI is not on PATH`**: the install
  exists but its CLI cannot run. Put the CLI on PATH, or update that harness by
  hand and run again.
- **`cannot read 'claude plugin list --json'`** or the Codex equivalent: the CLI
  printed its own error, quoted in the line, and the harness's own files
  (`installed_plugins.json`, `config.toml`) show the collection installed.
  Codex lists nothing while any marketplace root lacks a manifest; remove the
  dead marketplace with `codex plugin marketplace remove <name>`, then run again.
  Without such files the harness is skipped with a `left:` line instead.
- **`cursor-plugin` foreign origin, not a clone, or diverged**, or a clone that is
  behind the release and dirty, detached, or without an upstream branch: the
  clone at `~/.cursor/plugins/local/bostonaholic` cannot fast-forward. Commit or
  discard its changes, check out its branch, set its upstream, or move it aside
  and clone again per INSTALL.md. A clone already at or past the release tag is
  never checked for these. The pull follows the clone's own branch, so it can
  land past the release tag.

## Failed steps

A step that fails stops the run. The script prints the tool's stderr, then the
failed step, each step not run, and the backups directory, which it keeps.
Earlier steps stay applied. Fix the cause and `run` again; a completed step no
longer appears in the plan.

`still planned after the run` means every step ran but a second inspection
still finds a gap. For Claude Code or Codex, the marketplace serves an older
version than the release tag; report the gap. The backups are already deleted.

## Left lines

`left:` lines are reports, not errors. The script never changes these:

- A symlink or file where a collection skill goes, such as a `skills` CLI
  install linked into `~/.cursor/skills`. Update it as INSTALL.md's "One skill" section shows.
  A real directory under a collection name is refreshed, whatever installed it.
- A directory with no `SKILL.md` under a collection name.
- A file, or a directory without a `SKILL.md`, under a retired skill's name.
- A Claude Code or Codex listing that failed where no install is shown.
- `bostonaholic@skills` installed in Claude Code at project or local scope.
  Update it with the `claude plugin update` command the line shows.

## Backups

Each replaced copy and removed retired copy moves to
`${XDG_DATA_HOME:-~/.local/share}/updating-bostonaholic-skills/backups/<UTC timestamp>/<harness>/<name>`
during the run. Once every step runs, `run` deletes the whole backups
directory, earlier runs' backups included. After a failed step it stays; to
undo a replacement, move the old copy back over the new one.
