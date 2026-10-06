---
name: using-jq
description: Writes, explains, and debugs jq programs that filter, reshape, aggregate, merge, and convert JSON. Use when the user asks to parse, filter, transform, query, or merge JSON, convert JSON to CSV or TSV, edit a JSON file in place, or process JSON output from curl, gh, or another CLI.
---

# jq

Prefer jq over an ad hoc script for JSON in shell pipelines. Standard jq syntax
is assumed; this skill covers the mistakes that produce wrong output silently.

## Check the version first

Run `jq --version` before using a builtin from a recent release. Distribution
and OS builds often lag. When a builtin fails with `<name>/<arity> is not
defined`, use the fallback:

- Needs 1.7: `pick(.a, .b.c)`; fallback
  `. as $in | reduce path(.a, .b.c) as $p (null; setpath($p; $in | getpath($p)))`
- Needs 1.7: `abs`; fallback `if . < 0 then -. else . end`
- Needs 1.7: `if` without `else`; fallback: add `else . end`
- Needs 1.8: `trim`, `ltrim`, `rtrim`; fallbacks `gsub("^\\s+|\\s+$"; "")`,
  `sub("^\\s+"; "")`, `sub("\\s+$"; "")`
- Needs 1.8: `add(f)`; fallback `[f] | add`
- Needs 1.8: `skip(n; f)`; fallback `[f][n:][]`
- Needs 1.8: `@urid`; no jq fallback, decode outside jq

`leaf_paths` was removed in 1.7; use `paths(scalars)` on every version.
`gh --jq` runs a built-in jq implementation, not the installed `jq`, so this
list does not apply there.

## Gotchas

- **Shell values:** pass them with `--arg name "$v"` (always a string) or
  `--argjson name "$v"` (numbers, booleans, JSON). Never splice shell variables
  into the program. jq orders every string above every number, so with
  `--arg n 1`, `$n > 3` is silently `true`.
- **Defaults:** `.x // d` replaces `false` as well as `null`, so
  `.enabled // true` turns an explicit `false` into `true`. Use
  `if .enabled == null then true else .enabled end` when `false` is meaningful.
- **Flattening:** `flatten(1)` removes one level and keeps scalars;
  `[.[][]]` errors on any scalar element; bare `flatten` removes every level.
- **CSV and TSV:** `@csv` and `@tsv` accept only arrays of scalars. Convert
  nested values with `tojson` first. Use `-r` so the row is not re-quoted.
- **Shell consumption:** use `-r` for strings fed to other commands, `-c` for
  one JSON value per line, and `-e` in conditionals (exit 1 when the last output
  is `false` or `null`, 4 when there is no output).
- **Many documents:** `-s` loads every input into one array in memory. For
  large or streamed input use `-n` with `inputs`, or `reduce inputs as $x`.
- **Big integers:** integers above 2^53 lose precision in arithmetic, and
  before jq 1.7 on output too. Keep IDs as strings.

## Edit a file in place

`jq '...' f.json > f.json` truncates `f.json` before jq reads it. Write to a
temporary file, check that it holds exactly one valid JSON value, then replace
the original:

```sh
jq '.version = "2.0"' package.json > package.json.tmp &&
  [ "$(jq -s length package.json.tmp)" = 1 ] &&
  mv package.json.tmp package.json
```

If any step fails, delete `package.json.tmp` and leave the original untouched.
The length check catches a filter that emits a stream (for example a stray
`.[]`), which `jq empty` alone accepts.

## References

- [Built-in functions](references/filters.md): read when you need a builtin's
  exact signature, regex flags, date formats, or format strings.
- [Advanced patterns](references/advanced.md): read for `reduce`, `foreach`,
  streaming large files with `--stream`, recursive walks, joins across files,
  or custom functions.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.
