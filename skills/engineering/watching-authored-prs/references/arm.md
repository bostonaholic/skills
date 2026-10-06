# Arm

## Grants

Every grant needs an arming cue in the same instruction, the CI fix grant
included. A bare "handle the comments" routes to a one-shot
`/addressing-pr-comments` triage, not a watch. When the cue is ambiguous about
authorization, use `present-then-stop`, never `authorized`.

The object of the fix verb decides which subject it grants; the opening words
of the phrase do not:

- CI objects: `CI`, `checks`, `failing checks`, `the build`. Feedback objects:
  `comments`, `feedback`, `review feedback`.
- A fix verb with no object grants feedback only. So do "handle the comments"
  and "address feedback as it comes in".
- Any other object, or an unclear one, gives both subjects their defaults. The
  arm report then prints `watch and fix comments and CI`, the phrase that
  grants both.

| Arming instruction                                                           | Feedback          | CI     |
| ---------------------------------------------------------------------------- | ----------------- | ------ |
| `watch the PR`                                                               | present-then-stop | report |
| `watch and fix`, `watch this PR and fix comments`                            | authorized        | report |
| `watch and fix CI`, `watch this PR and fix failing checks`                   | present-then-stop | fix    |
| `watch and fix comments and CI`, `watch this PR and fix feedback and checks` | authorized        | fix    |
| `watch and fix everything`                                                   | present-then-stop | report |

The arm report names both grants.

## Draft promotion and the ticket

- Promote a draft only when the arming cue clearly expresses readiness: "the
  PR is ready for review", or `/watching-authored-prs` invoked with that
  stated intent. Then run `gh pr ready` and report the promotion loudly. If it
  fails, warn and keep watching.
- On an ambiguous cue such as "watch the PR", watch the draft in place and say
  so. End the arm report with the offer: say "the PR is ready for review" to
  promote it now.
- Move the ticket to in-review, best effort. The ticket is the issue named by
  the PR body's `Closes #<n>` or `Part of <ref>` footer; with no footer, or no
  reachable tracker, skip silently. Never move it while the PR is a draft
  (`gh pr view --json isDraft`): a draft keeps its in-progress state. A
  tracker call never blocks the watch.

## Baseline

- Take the baseline from the shared pull-request comment retrieval: unresolved
  thread ids, non-empty review-summary ids with their submission times,
  conversation-comment ids with their timestamps, `state`, `reviewDecision`,
  and the head SHA from the poll. Record ids, not just the latest timestamp:
  the triaged-id set is what makes triage idempotent across cycles, per the
  [durable state rules](shared/durable-state.md).
- The viewer's own review summaries and conversation comments are never
  feedback: exclude them from the baseline and every later poll. Everyone
  else's count, bots included.
- If the PR is already approved at arm, report it and run one final triage
  pass over the fully paginated retrieval result: every unresolved thread and
  every PR-level item whose node id is not in the triaged-id set. Do not fetch
  again, and do not loop.
- Each arm starts with an empty reported-failure set, zero attempt counts, and
  an empty fix-commit list, so a re-arm reports current CI failures once more.

## Re-arming

- A soft-cap re-arm keeps both grants. A `Feedback exclusion`,
  `Push failure`, `CI exclusion`, or `CI fix bound` stop ends both, so a
  re-arm after one starts in `present-then-stop` and `CI report` unless the
  user restates them.
- A second arm in the same session replaces the previous baseline and CI
  state. There is no cross-session state: after a restart, the user re-arms.
