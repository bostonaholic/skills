# Review re-request

Run once per pass, as its last action. When no feedback awaits a response,
the script re-requests review from each reviewer whose latest review requested
changes.

## Passes and gate

- A **triage pass** is triage steps 1-7, including auto-applies and a
  whole-batch direction given with the invocation. Never run this from a
  single item's apply.
- A **decision pass** acts in a later turn on the user's chosen items from an
  earlier report or a watch stop.

An item reaches an outcome when A, B, E, or F executes, or the C or D reply
posts. G items, could-not-apply, held security changes, failed pushes, and
items still on a punch list have none.

Run the script only when the pass gave at least one item an outcome and left
none without one. If the gate fails because of punch-list items or no
outcomes, print nothing. Otherwise print `Review re-request: not sent` with
the URL of each item left without an outcome.

## Run

```bash
node "<skill-dir>/scripts/re-request-review.mjs" --report "<pr-url>"
```

It reads review state from GitHub itself and never notifies a reviewer who
already has a pending request. Print its stdout unchanged as the
`Review re-request:` line group (in a watch, inside the batch report); every
line comes from GitHub state, never from comment bodies. Its header documents
each line.

Exit 1 covers read failures and failed requests: never claim a request went
out for a failed login, and on an auth failure suggest `gh auth login` or
`gh auth refresh`. Exit 2 is a bad URL. A re-request failure is never fatal to
the pass or a watch.
