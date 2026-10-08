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
node "<skill-dir>/scripts/re-request-review.mjs" "<pr-url>"
```

It reads review state from GitHub itself and never notifies a reviewer who
already has a pending request. Its header documents every stdout token.

## Report

Print one `Review re-request:` line group (in a watch, inside the batch
report), built only from the script's stdout tokens, never from comment
bodies:

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

`<stderr reason>` is the rest of the stderr line starting
`re-request-review.mjs:`. Exit 1 covers read failures and failed requests:
never claim a request went out for a failed login, and on an auth failure
suggest `gh auth login` or `gh auth refresh`. Exit 2 is a bad URL. A
re-request failure is never fatal to the pass or a watch.
