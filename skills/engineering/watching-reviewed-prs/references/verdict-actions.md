# Verdict actions

Read this when a verdict leads to a rebuttal or a reaction.

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
