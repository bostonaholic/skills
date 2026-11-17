# Verdict actions

Read this when a verdict leads to a resolve, a rebuttal, or a reaction.

Addressed or answered resolves a thread in `approve` mode and writes only a
reaction in `reReview`; pending writes nothing; rejected posts one rebuttal
and leaves the item open, in either mode.

- **Dispute stands.** A rejected thread whose poll item has
  `viewerReplied: true` stops the loop as `Dispute stands` before any write
  that cycle. Never a second rebuttal.
- **Resolve**, in `approve` mode only, with `resolveReviewThread`, skipping
  threads already resolved; the response must read `isResolved: true`. After
  a confirmed resolve, set the verdict's `key` to the trigger's `resolvedKey`
  and add the thread id to `resolvedBySkill`. A resolve failure warns, keeps
  the verdict, and carries on.
- **Rebut** with only these things: which claim the branch does
  not bear out, the specific evidence (file, line, symbol), and what would
  settle it, as an `issue` in the [finding format](shared/findings.md) with the
  decoration the original comment carried. Carry the automated-attribution
  marker the user or project prescribes, never re-argue a conceded point, and
  never name this skill or an agent. Pass the body by file: on a thread, the
  GraphQL `addPullRequestReviewThreadReply` mutation with
  `-F body=@<rebuttal-file>`; for a PR-level item,
  `gh pr comment "$PR_URL" --body-file <rebuttal-file>`. Record the new
  comment's URL.
- **React** on the comment that claimed the settlement, never the viewer's
  own: 👍 for answered, or addressed with a reply; 👎 for rejected; nothing
  for pending or a push with no reply. Use the
  [reaction mechanics](shared/reaction-mechanics.md). A reaction failure never
  stops the watch.
