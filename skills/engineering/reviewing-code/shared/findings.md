<!-- Canonical file: shared/findings.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Review Findings

## Finding Format

Code review uses [Conventional Comments](https://conventionalcomments.org).
Every finding includes a specific `file:line`.

### Comment Style

Address code, not its author; assume competence. Explain why. Reserve `issue:`
for correctness, security, or maintainability defects; use `suggestion:`/
`nitpick:` for preferences. More than ~10 substantive comments on one change
indicates a design problem: propose splitting the change or continuing design
discussion outside review.

### Comment Types

Every body begins with its label and decoration inside literal `**...**`.

**issue (blocking):** must be fixed before approval.

```text
**issue (blocking):** This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**suggestion (non-blocking):** author may accept or decline.

**nitpick (non-blocking):** minor style/naming; never blocks.

## Severity

A finding is **blocking** when its label is `issue (blocking)`; one blocking
finding makes the review verdict REQUEST CHANGES. `suggestion (non-blocking)`
and `nitpick (non-blocking)` never block; a report with only these is
COMMENT. List blocking findings first.
