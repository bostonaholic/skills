# Report schema

The skill writes `report.json`, `scripts/inventory.mjs` writes
`inventory.json`, and `scripts/render-report.mjs` checks the two against each
other and writes `report.md`. On any broken rule the renderer names each one
and writes nothing, so its errors are the full rule list.

The stub (procedure step 2) holds `version`, `skill`, and `scope` without
`commit`. Step 6 adds `scope.commit`, `lanes`, and `gaps`.

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
    "commit": "<git rev-parse HEAD at step 6>"
  },
  "lanes": ["<one lane object, as the lane analyst brief returns it>"],
  "gaps": [{ "file": "<path>", "reason": "<why it was not measured>" }]
}
```

Every `inventory.json` file with `status: "text"` sits in exactly one lane's
`files` or in `gaps`. With `scope.coverage`, every hot function other than
`<module>` carries `coverage`; without it, none does.
