# Arm details

Read this when arming, before the first poll.

- Promote a draft (`gh pr ready`) only when the cue clearly says the PR is
  ready for review and every check on the head has passed, and report it. A
  failing check blocks the promotion even when branch protection does not
  require it (codecov, for one); report it by name. Otherwise watch the draft
  and offer to promote it.
- Move the ticket (the body's `Closes #<n>` or `Part of <ref>`) to in-review,
  best effort, never while a draft; a tracker call never blocks the watch.
