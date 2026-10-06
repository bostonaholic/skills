# Ticket in review

Every tracker interaction below is best-effort and tracker-agnostic. If the project defines no tracker-move mechanism (for example, a PR with no ticket, or a tracker the environment cannot reach), skip silently and continue. Never block the watch on a tracker update.

The ticket is the issue that the PR body's `Closes #<n>` or `Part of <ref>` footer names. With no such footer, skip.

**Never move the ticket to in-review while the PR is a draft.** A draft is not under review, so while the PR is a draft the ticket keeps its in-progress state. Move the ticket to the tracker's in-review state **only once the PR is marked ready for review** (non-draft; on GitHub, `gh pr view --json isDraft`).
