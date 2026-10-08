# Input

`$ARGUMENTS` holds optional scope paths, an optional `--out <dir>`, and an
optional `--coverage <file>`. Stop and name an unknown flag.

- **Path base.** Every relative path (scope, `--out`, `--coverage`) resolves
  against `git rev-parse --show-toplevel`, never the session's directory.
  From `packages/api/`, `src` means `<top>/src`.
- **Scope.** Each named path is a top-level-relative directory or file; none
  means `.`. A subsystem name that is not a path resolves to the directories
  that own it; state the resolution in one line. Paths match literally, never
  as globs: `app/[id]` matches only `app/[id]`.
- **Output directory.** Default `<top>/docs/plans/<YYYY-MM-DD>-auditing-complexity/`.
  An `--out` value holds only `A-Z a-z 0-9 . _ / -`, has no `..` segment, does
  not start with `-`, and names a directory or a path that does not exist yet.
  Never stage or commit the output.
- **Coverage file.** Optional; without it the report states that CRAP did
  not run. A `--coverage` value appears at most once with a value, holds only
  `A-Z a-z 0-9 . _ / -`, has no `..` segment, does not start with `-` or `/`,
  and does not lie inside the output directory. The audit only reads it:
  never run tests or regenerate it. Any format works if it has per-line
  records (line number and hit count) keyed by a source path that is
  top-level-relative, `./`-prefixed, or absolute under the top level; lists
  each unexecuted coverable line with count 0; and keeps different source
  files on different text lines.

Stop on a value that breaks these rules, naming the rule, before writing
anything.

## Keep vendored and generated code out

`scope.exclude` holds one `{ path, reason }` record for the top directory of
each tracked tree of these kinds (or a single file when no such directory
holds it), with the evidence as `reason`:

- **Vendored dependencies**: a `linguist-vendored` entry in `.gitattributes`,
  or the manifest naming the path as vendored.
- **Generated code**: a `linguist-generated` entry, or a generated-code header
  in the file.
- **Build output**: the manifest or build config naming the path as output.

When the output directory sits under the top level, add it with reason
`audit output`. A directory name alone, such as `vendor` or `dist`, is not
evidence. Never exclude a path that equals or contains a named path.
