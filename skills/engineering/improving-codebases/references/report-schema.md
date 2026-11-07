# Report schema

`report.json` is the single source of truth, assembled in `<run>`.
`scripts/render-report.mjs` checks it against the lane registry and the
repository, then writes `report.json` and `report.md` into `<out>`. The
renderer rejects a report that breaks a rule, names each broken rule, and
writes nothing, so its errors are the full rule list.

## Contents

- [`report.json`](#reportjson)
- [Check result file](#check-result-file)
- [Test request](#test-request)
- [`<run>` layout](#run-layout)
- [Rules](#rules)

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
      "outcome": "proposed",
      "reason": "<why the finding ends here>",
      "proposedChange": "<the change, from the make return>",
      "artifacts": ["<repository-relative path the make step kept>"],
      "checks": [{ "name": "<check name>", "result": "<absolute path of a result file under <run>>" }],
      "review": { "status": "not-run", "reason": "<why>" },
      "coveringTests": ["<path:line of a test that drives it>"],
      "changed": ["<path from verify.json>"]
    }
  ]
}
```

## Check result file

`run-tlc.mjs` and `run-bounded.mjs` write this shape. The renderer reads it
and embeds it, so the model never states a result.

| Field            | Rule                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `check`          | `tests`, or the check name, such as `model-check`                                               |
| `status`         | `pass`, `fail`, or `not-run`                                                                    |
| `reason`         | Necessary for `not-run`                                                                         |
| `trace`          | Necessary for `fail`: the counterexample, or the log tail for tests                             |
| `seconds`        | Wall clock                                                                                      |
| `command`        | The argv that ran                                                                               |
| `distinctStates` | `run-tlc.mjs` only. A `pass` needs at least 2                                                   |
| `inputs`         | `run-tlc.mjs` only. `{ path, sha256 }` for every `.tla` and `.cfg` it copied, siblings included |
| `tree`           | `run-bounded.mjs` only. One digest of HEAD, every ref, and the content of each tracked change   |

## Test request

`run-bounded.mjs <request.json>` reads this shape and runs `argv` with no
shell. A run that changes `tree` reads `fail`, with the change in `reason`.

```json
{
  "check": "tests",
  "argv": ["<test command>", "<argument>"],
  "cwd": "<top>",
  "env": ["<NAME from --env>"],
  "result": "<run>/baseline.json",
  "log": "<run>/baseline.log"
}
```

## `<run>` layout

- `report.json`: the report the main session assembles.
- `make/<id>.json`: the JSON block of a `complete` make return.
- `tlc/<id>/<k>.json`: one `run-tlc.mjs` result per run, beside the scratch
  directory TLC ran in.
- `baseline.json`: the baseline test result.
- `checkpoints/<id>/`: the `save` manifest and copies, `verify.json` with
  `changed`, `escaped`, `problem`, and `tree`, `before/` with the saved
  version of each changed file for the reviewer, and `tests.json`, the test
  result after the make step.

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
- `outcome` is `applied`, `proposed`, `reported`, or `deferred`. Every
  outcome but `applied` needs a `reason`. Only a `makes: false` lane uses `reported`. `deferred` means the
  lane has a make step and it did not finish for this finding.
- An `applied` or `proposed` finding needs a `{ name, result }`
  item in `checks` for each name in its lane's `checks`, and at least one
  artifact with a suffix from its lane's `artifacts`. Each artifact exists on
  disk, and each `result` sits under `<run>` by real path. A `proposed`
  finding also needs a non-empty `proposedChange`.
- An `applied` finding needs `<run>/baseline.json` to read `pass`, non-empty
  `coveringTests` and `changed`, and a `review.status` of `confirmed` or
  `not-run`. Each `coveringTests` entry is `path:line`, and may sit outside
  the scope. Its `tests` item must name `<run>/checkpoints/<id>/tests.json`,
  which reads `pass` and holds the `tree` from that step's `verify.json`. A
  `model-check` result of `fail` keeps the finding valid.
- `review` is `{ status, reason }`, with `status` one of `confirmed`,
  `refuted`, `inconclusive`, or `not-run`. Every status but `confirmed`
  needs a `reason`.
- Each check reads the status its result file holds; a status typed in
  `report.json` loses. A `pass` whose `inputs` file changed since the run
  reads `not-run` with the reason `spec marked after review` when
  `review.status` is `refuted` or `inconclusive`, else `spec changed after
  the run`. A `fail` keeps its trace. A finding with checks reads `verified`
  only when every resolved check reads `pass` and `review.status` is
  `confirmed`; every other finding with checks reads `unverified`. The written
  `report.json` and `report.md` embed each resolved check, because `<run>`
  is temporary.
- With no finding, the renderer prints `no findings` and writes nothing.
- The renderer refuses a symlinked `report.json` or `report.md` in `<out>`,
  and a `report.json` there whose `skill` is not `improving-codebases`.
