# Input

The request names optional scope paths, an optional `--out <dir>`, and any
number of `--env <NAME>`. Before any write, stop and name the rule on an
unknown flag, a path outside the repository, a scope with no tracked file, a
bad `--out`, or a bad `--env` name.

- **Scope.** Each path resolves against `<top>` and matches literally, never
  as a glob; none means `.`. Resolve a subsystem name to the directories that
  own it, and state the resolution in one line.
- **Output directory.** An `--out` value holds only `A-Z a-z 0-9 . _ / -`,
  has no `..` segment, and does not start with `-`. The default is
  `<top>/docs/plans/<YYYY-MM-DD>-improving-codebases/`.
- **Environment.** Each `--env` name matches `^[A-Z_][A-Z0-9_]*$`. Test runs
  get only the allowlist in `scripts/run-bounded.mjs` plus these names, and
  only the user's `--env` values fill a request's `env`, never repository
  content.
- **Earlier report.** Stop when `<out>/report.json` or `<out>/report.md` is a
  symlink, or when `<out>/report.json` exists and does not hold
  `skill: "improving-codebases"`.
