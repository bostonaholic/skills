# Review re-request

Run this once per pass, as the pass's last action. When no feedback on the PR
awaits a response, it re-requests review from each reviewer whose latest
review requested changes, and GitHub notifies each one.

## Contents

- Passes
- Pass gate
- Run the script
- Report
- Exit codes

## Passes

- A **triage pass** is triage steps 1-7 for one PR, including the step 6
  auto-applies and a whole-batch direction given with the invocation ("fix the
  PR feedback"). It reaches this file at step 8. Never run it from a single
  item's run in step 6.
- A **decision pass** acts, in a later turn, on items from an earlier report
  (a triage pass's punch list or a watch stop) by the user's picks or
  direction. Its items are the chosen items only. It reaches this file after
  its last chosen item reaches an outcome.

An item reaches an outcome when option A, B, E, or F executes, or when the
reply for option C or D posts. Each outcome reply ends with the item's outcome
marker line ([authorized execution](references/authorized-execution.md)).

These items have no outcome: an option G item, a change that could not be
made, a security-sensitive change held for review, an item whose push failed,
and an item waiting on the punch list for the user's choice.

## Pass gate

Run the script only when both hold:

- the pass gave at least one item an outcome;
- no item in the pass is left without one.

When the gate fails because the pass has its own punch-list items, or because
no item reached an outcome, print nothing and run nothing. When it fails for
another reason, run nothing and print `Review re-request: not sent` with the
URL of each item left without an outcome.

## Run the script

The script needs `node` and `gh` (`command -v node gh`). When either is
missing, print `Review re-request: not sent, <tool> is not installed` and
skip the run.

Otherwise run `scripts/re-request-review.mjs` with the PR `url` from triage
step 1, where `<skill-dir>` is this skill's absolute directory:

```bash
node "<skill-dir>/scripts/re-request-review.mjs" "<url>"
```

The script reads the PR's review state from GitHub itself, never from this
pass's memory. It sends a request only when no feedback on the PR awaits a
response, and never to a reviewer who already has a pending request.

## Report

Print one `Review re-request:` line group after the pass's report. In a watch,
the batch report carries it. Build it only from the script's stdout tokens and
the URLs they print, using the report text below exactly; never quote a
comment body. Write one report line on the label's line; write more as
indented lines under the label.

| Script stdout                                                | Report text                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `re-requested <login>`                                       | `re-requested @<login> (no feedback awaits a response, latest review CHANGES_REQUESTED)` |
| `already-requested <login>`                                  | `@<login> already has a pending review request`                                          |
| `skipped <login> not-a-user`                                 | `skipped @<login>, not a user account`                                                   |
| `skipped invalid-login`                                      | `skipped a reviewer whose login failed validation`                                       |
| `skipped author-unavailable`                                 | `skipped a reviewer whose account is unavailable`                                        |
| `pending <url>` lines, then `not-requested pending-feedback` | `not sent, <n> items await a response: <url>, <url>`, or `1 item awaits` for one item    |
| `pending url-unavailable`                                    | count the item in `<n>`, and write `an item with no usable URL` in place of its URL      |
| `pending-more <n>`                                           | `and <n> more` after the listed URLs                                                     |
| `pending empty-changes-request <login>`                      | `not sent, @<login> requested changes with no comment. Ask what they want.`              |
| `not-requested review-decision APPROVED`                     | `not sent, the PR is approved`                                                           |
| `not-requested no-changes-requested-reviewer`                | `not sent, no reviewer needs a new request`                                              |
| `not-requested review-state-read-failed`                     | `not sent, the review-state read failed: <stderr reason>`                                |
| `not-requested review-state-incomplete`                      | `not sent, the PR has more feedback than the script reads`                               |
| `not-requested gh-unavailable`                               | `not sent, gh could not be run`                                                          |
| `failed <login> http-<status>`                               | `failed for @<login> (HTTP <status>)`                                                    |
| `failed <login> gh-exit-<code>`                              | `failed for @<login> (gh exit <code>)`                                                   |

`<stderr reason>` is the rest of the script's stderr line that starts with
`re-request-review.mjs:`.

```text
Review re-request: re-requested @alice (no feedback awaits a response, latest review CHANGES_REQUESTED)
Review re-request: not sent, 1 item awaits a response: https://github.com/o/r/pull/412#discussion_r1001
```

## Exit codes

- **0:** write the report lines from the table.
- **1:** a read failed, the read was incomplete, `gh` could not be run, or at
  least one request failed. The table names each case. Never claim a request
  went out for a failed login. On an authentication failure (an `http-401`
  token, or stderr that names authentication), suggest `gh auth login` or
  `gh auth refresh`.
- **2:** a usage fault. Check the `url` passed.

A re-request failure is never fatal: the triage result, its pushes, and a
watch loop stand. Report the failure and continue.
