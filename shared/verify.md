<!-- Canonical file: shared/verify.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Verify playbook

A producer exercises its own change before handoff; an independent reviewer judges the result. A green build is not evidence for a behavior nobody drove.

## Exercise the claim on its surface

| Claim surface  | Exercise it with                        | Expected observable evidence                           |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| Library        | a real consumer program that imports it | compile/run output, returned values, files written     |
| CLI            | invocation + filesystem/stdio           | exit code, stdout/stderr, files created or changed     |
| Service        | requests + resulting state              | HTTP status, response body, persisted or queried state |
| UI interaction | drive the app as a user                 | rendered routes, interaction outcomes, error states    |

Reuse the project's own scripts, Makefile targets, CI steps, and seed data before adding a helper. Record each check's exact command, exit code, and, for failures, the essential error lines.

## Checks interfere

A production build and a dev-server-backed browser suite share one build directory in most frameworks, so run back to back the second reads state the first wrote and fails with assertions that look like regressions. Clear the build directory and run the browser suite alone. A suite that boots its own servers is unsafe beside anything else, another agent's dev server included.

## Verdict

- **PASS:** every detected check passed and every acceptance claim was exercised on its surface.
- **FAIL:** a check failed or a claimed behavior could not be reproduced. List every failure.
- **FAIL:** zero checks detected. A project with no lint, type check, build, or tests cannot pass verification; say what is missing.
- **UNKNOWN:** a required tool or capability is unavailable. Never report an unexecuted check as passed, and keep unavailable tooling (an environment gap) separate from failed behavior (a product defect).

## Rules

- Do not fix failures during verification. Report them as they occur.
- If a check prints nothing for 120 seconds, kill it and report TIMEOUT. A slow suite that is still printing is not hung.
- Never retry to mask a flake. Each check runs once. A red-to-green rerun without a code change is evidence of a flake or an intermittent bug, not a PASS; note it as intermittent.
- A baseline is comparable only under the same isolation. Run both sides of a before/after comparison the same way: a false red recorded as the pre-change state reclassifies a later regression as pre-existing, and that failure goes unnoticed because it errs in the safe direction.
- Coverage is reported, not gated. Report the delta on changed files and never gate on an absolute threshold. Test count and coverage are data, not proof the tests are good ([value bar](testing.md#value-bar)).

## Separate three failures

When a maintained verification recipe stops passing, separate the cause before touching code:

1. **Documentation drift:** the recipe no longer matches how the capability runs. Fix the recipe.
2. **Harness defect:** the check itself is broken. Fix the harness.
3. **Product regression:** the capability stopped working. Report it; never rewrite expected behavior to conceal it.
