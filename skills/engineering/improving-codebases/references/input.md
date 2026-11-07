# Input

The request names optional scope paths and an optional `--out <dir>`.
Before any write, stop and name the rule on an unknown flag, a path outside
the repository, a scope with no tracked file, or a bad `--out`.

- **Scope.** Each path resolves against `<top>` and matches literally, never
  as a glob; none means `.`. Resolve a subsystem name to the directories that
  own it, and state the resolution in one line.
- **Output directory.** An `--out` value holds only `A-Z a-z 0-9 . _ / -`,
  has no `..` segment, and does not start with `-`. The default is
  `<top>/docs/plans/<YYYY-MM-DD>-improving-codebases/`.
- **Earlier report.** Stop when `<out>/report.json` or `<out>/report.md` is a
  symlink, or when `<out>/report.json` exists and does not hold
  `skill: "improving-codebases"`.
