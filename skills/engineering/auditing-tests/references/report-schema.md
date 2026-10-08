# Report schema

`report.json` is the single source of truth; `scripts/render-report.mjs`
renders `report.md` from it. The renderer rejects a report that breaks a
rule, names each broken rule, and writes nothing, so its errors are the full
rule list.

## `report.json`

```json
{
  "version": 1,
  "scope": {
    "root": "<repository name>",
    "paths": ["<scope path>"],
    "discovery": "<command or pattern that lists the inventory>",
    "commit": "<git sha>",
    "dirty": ["<uncommitted path in scope>"],
    "date": "<YYYY-MM-DD>"
  },
  "baseline": {
    "command": "<suite command>",
    "status": "ran",
    "reason": "<why it did not run; only for not-run>",
    "failures": [{ "file": "<test file>", "name": "<test name>", "assertion": "<printed failure>" }]
  },
  "inventory": ["<test file>"],
  "lanes": ["<one lane object per the lane auditor brief>"],
  "layers": [
    { "contract": "<what the suites guard>", "keeper": "<keeper suite>", "retire": ["<test file>"], "carry": ["<assertion to move into the keeper>"] }
  ],
  "downgraded": [{ "id": "<test id>", "from": "<C or D>", "reason": "<verifier's reason>" }],
  "gaps": [{ "file": "<test file>", "reason": "<why it was not audited>" }]
}
```

Each lane object is the lane auditor's return, with `"verified": true`
added to every `C` and `D` test that step 6 confirmed. Every `C` and `D` must
be verified, and no `D` may appear in `baseline.failures`.
