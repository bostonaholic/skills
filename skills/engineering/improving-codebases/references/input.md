# Input

In a sweep, the request names optional scope paths, any number of `--lane <name>`, an
optional `--out <dir>`, any number of `--env <NAME>`, and an optional
`--coverage <file>`. Before any write, stop and name the rule on an unknown
flag, a path outside the repository, a scope with no tracked file, a bad
`--out`, a bad `--env` name, or a bad `--coverage`. Stop on a value that
breaks these rules, naming the rule, before writing anything.

- **Path base.** Every relative path (scope, `--out`, `--coverage`) resolves
  against `git rev-parse --show-toplevel`, never the session's directory.
  From `packages/api/`, `src` means `<top>/src`.
- **Scope.** Each path resolves against `<top>` and matches literally, never
  as a glob; none means `.`. Resolve a subsystem name to the directories that
  own it, and state the resolution in one line.
- **Output directory.** An `--out` value holds only `A-Z a-z 0-9 . _ / -`,
  has no `..` segment, does not start with `-`, and names a directory or a
  path that does not exist yet. The default is
  `<top>/docs/plans/<YYYY-MM-DD>-improving-codebases/`.
- **Environment.** Each `--env` name matches `^[A-Z_][A-Z0-9_]*$`. Test runs
  get only the allowlist in `scripts/run-bounded.mjs` plus these names, and
  only the user's `--env` values fill a request's `env`, never repository
  content.
- **Coverage file.** Optional; without it the report states that CRAP did
  not run. A `--coverage` value appears at most once with a value, holds only
  `A-Z a-z 0-9 . _ / -`, has no `..` segment, does not start with `-` or `/`,
  and does not lie inside the output directory. The complexity lane only reads it:
  never run tests or regenerate it. Any format works if it has per-line
  records (line number and hit count) keyed by a source path that is
  top-level-relative, `./`-prefixed, or absolute under the top level; lists
  each unexecuted coverable line with count 0; and keeps different source
  files on different text lines.
- **Earlier report.** Stop when `<out>/report.json` or `<out>/report.md` is a
  symlink, or when `<out>/report.json` exists and does not hold
  `skill: "improving-codebases"`.

## Untangle mode

The rest of the request is the area or concern, read as text, never as a
scope path. Any flag stops the run. A flag is a word outside quotes and code
spans that starts with `--`. No other rule of this file applies to Untangle.

## Lane rules

Check these rules once `list-lanes.mjs` has built the registry, and before
`<run>` exists.

- **Lanes.** Each `--lane` value names a registry lane, and the stop names
  every registry lane. A repeat counts once.
- **Coverage lane.** `--coverage` needs the complexity lane selected.
- **Earlier lane report.** For each selected report lane:
  - The lane files are `report.json`, `inventory.json`, and `report.md` for
    complexity, and `report.json` and `report.md` for test-audit.
  - Stop when `<out>/<lane>` or any lane file in it is a symlink.
  - Stop when any lane file exists and `<out>/<lane>/report.json` does not
    hold `skill: "improving-codebases"` and `lane: "<lane>"`. A missing
    `report.json` holds no tag, so a lone `inventory.json` or `report.md`
    stops the run.
