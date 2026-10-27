# Design Review Report Format

Resolve the links below from this skill's directory.

## Report format

This template is exact. Emit the verdict line first and both headings, in
this order, on every report:

```markdown
**Verdict: <APPROVE | REQUEST CHANGES | COMMENT>**

### Summary

<The document reviewed and why the verdict, in two to five sentences. End
with the counts: `issue: <n>, suggestion: <n>, nitpick: <n>`.>

### Findings

<One finding per entry, blocking findings first. Exactly "No findings."
when there are none.>
```

- **APPROVE:** no findings.
- **REQUEST CHANGES:** at least one blocking finding. Non-blocking findings
  never reach this verdict, however many there are.
- **COMMENT:** non-blocking findings only.

Each finding uses a Conventional Comments label with its decoration from the
[finding format](shared/findings.md), plus a `file:line`: a line in the
design doc or in a file it cites.

## Merged report

The merged report follows the template above. Each finding in it ends with
a `lenses:` line, as the finding's last line. The line is `lenses:`, a
space, and the names of every lens that raised the finding, in this order:
`naive-reader`, `decisions`, `readiness`, `accuracy`. A comma and a space
separate the names. Example: `lenses: naive-reader, accuracy`.

A lens report carries no `lenses:` line.
