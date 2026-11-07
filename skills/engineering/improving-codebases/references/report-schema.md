# Report schema

`report.json` is the single source of truth, assembled in `<run>`.
`scripts/render-report.mjs` checks it against the lane registry and the
repository, then writes `report.json` and `report.md` into `<out>`. The
renderer rejects a report that breaks a rule, names each broken rule, and
writes nothing, so its errors are the full rule list.

## `report.json`

```json
{
  "version": 1,
  "skill": "improving-codebases",
  "scope": {
    "root": "<absolute path of the repository's top level>",
    "commit": "<git rev-parse HEAD at the start>",
    "date": "<YYYY-MM-DD>",
    "paths": ["<top-level-relative scope path, or .>"],
    "dirty": ["<path that git status --porcelain --untracked-files=no reports>"]
  },
  "groups": [{ "id": "<group id>", "files": ["<inventory file>"] }],
  "lanes": [
    { "lane": "<lane>", "ran": ["<group id>"], "failed": [{ "group": "<group id>", "reason": "<why>" }] }
  ],
  "gaps": [{ "path": "<file or directory>", "reason": "<why no group holds it>" }],
  "findings": [
    {
      "id": "<lane>/<n>",
      "lane": "<lane>",
      "title": "<one line>",
      "citations": ["<path:line>"],
      "evidence": [{ "kind": "<kind>", "name": "<name>", "citation": "<path:line>" }],
      "outcome": "reported",
      "reason": "<why the finding ends here>"
    }
  ]
}
```

## Rules

- `scope.commit` must equal HEAD when the renderer runs. A changed ref alone
  still renders.
- Every citation is `path:line`, split on its last colon, inside a
  `scope.paths` entry, and in range at `scope.commit`. A path under a
  `scope.dirty` entry skips the range test.
- `report.lanes` names every registry lane and nothing else. Each lane lists
  each group exactly once, under `ran` or `failed`. A lane with any `failed`
  group reads `partial`, else `complete`.
- Each tracked file under `scope.paths` sits in exactly one group, or under a
  `gaps` path, which names a file or a directory.
- `id` is `<lane>/<n>` with a positive integer `<n>`, unique in the report.
- A finding has a `title`, at least one citation, and at least one evidence
  item of each kind its lane declares.
- `outcome` is `reported`, which only a `makes: false` lane may use, and it
  needs a `reason`.
- With no finding, the renderer prints `no findings` and writes nothing.
- The renderer refuses a symlinked `report.json` or `report.md` in `<out>`,
  and a `report.json` there whose `skill` is not `improving-codebases`.
