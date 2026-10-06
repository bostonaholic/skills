# Report schema

## Contents

- `report.json`
- `inventory.json`
- Rules the renderer enforces
- `report.md`

The skill writes `report.json`, `scripts/inventory.mjs` writes
`inventory.json`, and `scripts/render-report.mjs` joins the two into
`report.md`. When any rule below breaks, the renderer names each broken rule
and writes nothing.

## `report.json`

Procedure step 2 writes `version`, `skill`, and `scope` without `commit`.
Step 5 adds `scope.commit`, `lanes`, and `gaps`.

```json
{
  "version": 1,
  "skill": "auditing-complexity",
  "scope": {
    "root": "<repository name>",
    "pathspecs": ["<top-level-relative path>"],
    "exclude": [{ "path": "<top-level-relative path>", "reason": "<evidence>" }],
    "date": "<YYYY-MM-DD>",
    "coverage": "<top-level-relative coverage file, only when given>",
    "commit": "<git rev-parse HEAD at step 5>"
  },
  "lanes": ["<one lane object per the lane analyst brief>"],
  "gaps": [{ "file": "<path>", "reason": "<why it was not measured>" }]
}
```

Each lane entry carries `functions`, `fanOut`, `mutableState`, and
`hotFunctions`, as the lane analyst brief defines them. A hot function holds
`name`, `line`, `endLine`, `cyclomatic`, `decisions`, `nesting`,
`deepestLine`, and `params`. With `scope.coverage`, every hot function
other than `<module>` also holds `coverage`: either
`{ "hit": [<line>], "missed": [<line>] }` with `crap`, a number with 2
decimals, or `{ "reason": "<why no score>" }` with no `crap`.

## `inventory.json`

```json
{
  "version": 1,
  "commit": "<HEAD at step 2>",
  "pathspecs": ["<scope.pathspecs, copied>"],
  "exclude": ["<scope.exclude path, copied>"],
  "coverage": "<scope.coverage, copied, only when given>",
  "dirty": ["<inventory path that differs from HEAD>"],
  "files": {
    "<top-level-relative path>": { "status": "text", "lines": 0 }
  }
}
```

- `files` holds every tracked file that matches a pathspec and no
  exclusion. That set is the inventory.
- `status` gives each path exactly one of these values. The script opens
  only a regular file whose real path stays inside the top level.
  - `text`: a readable file that the analysts can measure.
  - `binary`: a NUL byte in the first 8,000 bytes, which is git's own test.
  - `missing`: a tracked file deleted from the work tree.
  - `submodule`: index mode 160000. The audit never reads submodule
    contents.
  - `symlink`: index mode 120000, a symlink in the work tree, or a path
    whose real path leaves the top level through a symlinked directory.
  - `unreadable`: a directory, FIFO, or other file that is not regular, or
    any other read error.
- `lines` counts line feeds, plus 1 for an unterminated last line, and is 0
  unless `status` is `text`.
- `coverage` is present only when `scope.coverage` is. Before it copies
  the path, the script exits 1 unless the path is a string with no leading
  `/` and no `..` segment, and names a non-empty `text` file under the
  statuses above.
- `dirty` lists the inventory paths whose work-tree or index content
  differs from HEAD when the script ran.
- Every git call pins the output the script parses, so user, repository,
  and system git config change no number.

## Rules the renderer enforces

- Both `version` values are 1, and `skill` is `auditing-complexity`.
- `scope.commit`, `scope.pathspecs`, and the `scope.exclude` paths match
  `inventory.json` `commit`, `pathspecs`, and `exclude`.
- No exclusion equals or contains a named path.
- Every `text` file in `inventory.json` sits in exactly one lane's `files`
  or in `gaps`. Every lane or gap file is a `text` file in `inventory.json`.
- Each lane file has exactly one entry or one `skipped` record, never both.
  Each entry and `skipped` record names a file of its lane.
- `functions`, `fanOut`, `mutableState.count`, and every hot-function
  number are integers of 0 or more.
- Each location `kind` is `global`, `field`, or `param`, and `count` is at
  least the number of listed locations.
- Each hot function has `1 <= line <= endLine <= lines`, where `lines` comes
  from `inventory.json`. `cyclomatic` equals the length of `decisions` plus 1,
  and every decision line and `deepestLine` falls inside `line..endLine`.
- An entry has at most 6 hot functions, and never more than `functions`.
- A `<module>` hot function has `line` 1, `endLine` equal to the file's
  `lines`, and `params` 0.
- `scope.coverage` equals `inventory.json` `coverage`, or both are absent.
- Without `scope.coverage`, no hot function carries `coverage` or `crap`.
  With it, every hot function other than `<module>` carries `coverage`,
  and `<module>` carries neither.
- `coverage` holds a non-empty `reason` or both `hit` and `missed`, never
  both forms. List lines are integers inside `line..endLine`, appear once
  across both lists, and number at least 1 in total.
- `crap` appears only with the lists. It is a finite number within 0.01 of
  `cyclomatic² × (missed / (hit + missed))³ + cyclomatic`, where `hit` and
  `missed` are the list lengths. The error names the expected value.

## `report.md`

`scripts/render-report.mjs` owns the layout, ranking, row caps, and bands,
and the report states each rule beside the table it governs. Its sections,
in order:

1. **Summary.** Root, commit, date, scope, exclusions, and file counts;
   with a coverage file, combined and average CRAP.
2. **Files.** Measured files ranked by their highest hot-function
   cyclomatic complexity, with its CC band.
3. **Functions.** Every hot function ranked by cyclomatic complexity, with
   its CC band, nesting, length, and parameters.
4. **Change risk.** With a coverage file, scored functions ranked by the
   renderer's own CRAP recount, with coverage and CRAP band, then a
   `Not scored` table. Without one, `Not run: no coverage file was given.`
5. **Lanes.** One table per lane, one row per measured file.
6. **Gaps.** Every `gaps` and `skipped` record, with its reason.
7. **Not measured.** Every `inventory.json` file whose `status` is not
   `text`.
8. **Reading the numbers.** The CC and CRAP bands, four general reduction
   strategies, and the trend tip, from
   <https://getotterwise.com/blog/understanding-crap-and-cyclomatic-complexity-metrics>.
   They are reading aids that name no function. No band or score changes
   either script's exit status.

The report labels every analyst value "estimated by reading". `lines` is an
exact count from the script. Hit and missed lines come from the coverage
file through the analysts; no script parses that file.
