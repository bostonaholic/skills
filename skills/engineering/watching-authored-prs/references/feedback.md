# Feedback handling

Read this when handling `feedbackChange`, after passing `addressing-pr-comments` the feedback file.

- A PR-level ask not tied to specific code with confidence needs
  clarification, never a guessed edit.
- **present-then-stop:** items that clear the auto-apply bar are applied and
  resolved. If all did, keep looping; otherwise present the rest and stop as
  `Feedback exclusion` (any exclusion) or `Awaiting decision`.
- **authorized:** apply, push, reply, and resolve every non-excluded item
  whatever its confidence, then present exclusions and stop as
  `Feedback exclusion`, or keep looping when there are none.
- A failed push stops as `Push failure` with the `git push` output and the
  items left unapplied. Never reply "done" or resolve without landed code.
