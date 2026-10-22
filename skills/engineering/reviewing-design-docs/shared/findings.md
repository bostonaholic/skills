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

**nitpick (non-blocking):** minor style/naming; never blocks. At most three per
review; drop the rest, and drop any a formatter or linter would catch.

## Converging

Each rule below keeps a review from needing another round.

- **One finding per class.** When one defect recurs, write one finding that
  names the class and lists every instance's `file:line`, so the author fixes
  them together. When a linter rule or a line in the repository's agent
  instructions would catch the class, name it so the class is fixed at its
  source.
- **Pre-existing is not the author's.** A defect in code the change did not
  introduce (`git blame` on the base revision shows it) takes the
  `(non-blocking, pre-existing)` decoration and never sets the verdict, unless
  the change makes it newly reachable. A brief that drops such defects wins.
- **Raise the approach first.** A disagreement with the overall approach goes
  in the first review, as `suggestion (non-blocking)`. Never introduce one as
  blocking in a later round.

## Severity

A finding is **blocking** when its label is `issue (blocking)`; one blocking
finding makes the review verdict REQUEST CHANGES. `suggestion (non-blocking)`
and `nitpick (non-blocking)` never block; a report with only these is
COMMENT. List blocking findings first.
