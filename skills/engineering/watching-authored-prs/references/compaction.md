# Compaction

After a context compaction, re-derive the baseline from GitHub: unresolved
thread ids, review-summary ids with their authors and submission times,
conversation-comment ids with their authors and timestamps, `state`,
`reviewDecision`, the head SHA, and the CI checks for that head. Then continue
polling from the snapshot lines already in the transcript.

GitHub cannot return these, so recover them from the transcript:

- **The triaged PR-level id set**, from snapshot lines and batch reports. When
  no copy survives, fail toward re-presenting: treat the PR-level items as
  untriaged and triage them again, saying plainly that some may repeat.
- **The reported-failure set**, from snapshot lines and CI reports. When no
  copy survives, report the current failures again and say so.
- **Attempt counts, fix SHAs, and both grants**, from fix reports and snapshot
  lines. When the counts are lost, disable CI fixes for the rest of the arming
  and say so. A lost count must never allow an extra push.
