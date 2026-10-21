# CI fix

Read this only under the `CI fix` grant, after the cycle's CI report.

## Preconditions

Attempt a fix only when all of these hold; otherwise report which failed and
keep watching:

- the check has a readable log, read this cycle
- the logical check has fewer than 2 attempts
- this is not the cycle-3 poll, because no later poll can read the result
- the PR is not approved, because a push after approval can dismiss it
- feedback handling did not end the turn with items waiting on the user,
  because a push moves the head under them
- the binding below holds

## Binding and editable set

A matching `HEAD` alone does not tie the checkout to the PR: a branch stacked
on the PR head has the same SHA, and a push goes where the push settings
point. Run this with the poll's `head`, from the PR's checkout:

```bash
node <skill-dir>/scripts/ci-fix-preflight.mjs <pr-url> <head>
```

- `binding: ok`: `editable` is the editable set.
- `binding: fail`: report the `condition` and push nothing. A `head-moved`
  condition skips the attempt this cycle.
- Exit 1: report only, with no attempt counted. Exit 2 or 127: report the
  stderr line and push nothing.

## Attribution

Quote one log line that names a file, test, or symbol in the editable set.
Otherwise report "not attributable to this branch" and change nothing; flaky
tests, runner and network faults, and missing secrets end here.

## Fence and commit

- Edit only editable files, with the smallest change that fixes the attributed
  failure. Never edit a test to turn a check green: a red kept test points at
  the product first.
- Stage the edited paths with `git add --pathspec-from-file=<file>`, never
  `git add -A`.
- Commit with `git commit -F <file>`. The subject is
  `fix: repair failing CI check`; the body holds only `head <sha>` and one
  `job <job-id>` line per targeted check. Check names and log lines never
  enter the commit message: GitHub reads closing keywords, `@` mentions, and
  trailers from pushed commit text, and the PR's own workflows set check
  names.

## Publish

Push with the command the user or the repository's agent instructions name for
PR branches (for example `gt submit`), else plain `git push`, which the binding
covers. Any other command must have its remote and destination branch named by
its arguments, its configuration, or those instructions; otherwise the binding
fails as `publish target unknown`. Never add a force flag. A failure stops as
`Push failure` with the actual error output.

Report `CI fix <n>/2 for <display name>`, the quoted log line fenced and
labeled untrusted, the publish command, and the commit SHA. A commit targeting
several checks counts against each. When the check goes green, do not present
that as confidence in the tests behind it. Attempt counts carry over when
someone else pushes a new head.

## Bound

Per cycle: 1 preflight run and 1 fix commit. Per arming: 3 fix commits and 2
attempts per logical check. Keep these counts in the transcript: none passes
3, and every stop report names them. A check that fails after its second attempt, on
any head, stops as `CI fix bound`, naming the check, head SHA, and both fix
SHAs. Never extend the bound.

## Exclusions

Stop as `CI exclusion` when the candidate fix would edit a test file, CI or
check configuration (anything under `.github/`, or config for CI, linting,
formatting, type checking, test running, or coverage; when unsure, treat it as
configuration), or a file outside the editable set; add a skip, disable, or
suppression marker (`eslint-disable`, `@ts-ignore`, `# noqa`, `.skip(`); or
add exec- or eval-like code, network calls, or credential handling. A fix that
cannot be applied after attribution passed is also a `CI exclusion`. Present
the candidate diff, restore only the paths the attempt changed, and push
nothing.
