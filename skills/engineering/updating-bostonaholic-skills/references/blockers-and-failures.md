# Blockers and failures

Read this when `update.mjs` exits 1 or 4, or prints a `Blocked` or `left:` line.

## Contents

- Exit codes
- Blockers
- Failed steps
- Left lines
- Backups

## Exit codes

| Code | Meaning                                         | Next                                                  |
| ---- | ----------------------------------------------- | ----------------------------------------------------- |
| 0    | Plan printed, or every step ran                 | Verify with a second plan                             |
| 1    | A step failed, or the release could not be read | Report the tool's stderr; fix the cause, then re-plan |
| 2    | Usage: bad arguments or a malformed plan id     | Pass `plan`, or `apply` with the 40-hex `Plan id`     |
| 3    | The plan changed since it was confirmed         | Run the plan again and confirm again                  |
| 4    | The plan is blocked                             | Resolve each `Blocked` line, then re-plan             |

## Blockers

Nothing runs while any blocker stands, in any harness.

- **`claude CLI is not on PATH`** or **`codex CLI is not on PATH`**: the install
  exists but its CLI cannot run. Put the CLI on PATH, or update that harness by
  hand and re-plan.
- **`cannot read 'claude plugin list --json'`** or the Codex equivalent: the CLI
  printed its own error, quoted in the line. Codex lists nothing while any
  marketplace root lacks a manifest; remove the dead marketplace with
  `codex plugin marketplace remove <name>`, then re-plan.
- **`cursor-plugin` dirty, detached, diverged, or foreign origin**: the clone at
  `~/.cursor/plugins/local/bostonaholic` is not a clean clone of the release
  repository on a branch that fast-forwards. Commit or discard its changes,
  check out its branch, or move it aside and clone again per INSTALL.md.

## Failed steps

A step that fails stops the run. The script prints the tool's stderr, then the
failed step and each step not run. Earlier steps stay applied. Fix the cause,
run the plan again, and confirm the new plan id; a completed step no longer
appears in it.

## Left lines

`left:` lines are reports, not errors. The script never changes these:

- A symlink or file where a collection skill goes, such as an `npx skills`
  install linked into `~/.cursor/skills`. Update it with `npx skills@latest update`.
- A directory with no `SKILL.md` under a collection name.
- A skill the collection has retired. Delete it by hand if unwanted.
- `bostonaholic@skills` installed in Claude Code at project or local scope.
  Update it with the `claude plugin update` command the line shows.

## Backups

Each replaced copy moves to
`${XDG_DATA_HOME:-~/.local/share}/updating-bostonaholic-skills/backups/<UTC timestamp>/<harness>/<name>`.
To undo one, move it back over the new copy. The script never prunes backups.
