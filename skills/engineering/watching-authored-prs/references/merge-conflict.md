# Merge conflict

Read this when a poll reports `conflicting`.

Arming a watch on the user's own PR authorizes the rebase and the
lease-guarded force-push a conflict needs; do not stop to confirm them. Any
grant allows it, since resolving a conflict is not a feedback or CI fix.

## Bind the checkout

`modernizing-prs` pushes the checked-out branch, so first tie the
checkout to the PR with the [CI fix binding](references/ci-fix.md#binding-and-editable-set)
preflight and the poll's `head`. Ignore its `editable` set. On `binding: fail`
or any nonzero exit, stop as `Merge conflict` and report the condition or the
stderr.

## Rebase

Call the Skill tool with `modernizing-prs` and the PR number. Without a Skill
tool, follow the [skill call rules](shared/skill-calls.md).

- It finished pushed: report its base, each conflict and how both intents were
  kept, the push result, and its recovery command. End the cycle with no
  feedback or CI step; the next poll reads the new head.
- It stopped (a `REWORK` or `CLOSE` disposition, an undecided conflict, a
  check that regressed, a rejected push): stop as `Merge conflict` and relay
  its report.
- It is not installed: stop as `Merge conflict` and end with
  `Next: /modernizing-prs <n>, then re-arm the watch.`

At most one rebase per cycle; the watch loop's cycle cap bounds the rest. CI
fix attempt counts carry over to the rebased head.
