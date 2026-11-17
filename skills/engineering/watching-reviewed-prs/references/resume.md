# Resume

Read this when the conversation was compacted during a watch, or when a watch
resumes in a later turn or session, such as after a background wake or a
soft-cap handoff the user picks up.

Re-read the state file at the path the last snapshot line or handoff named,
and re-run the poll. A resume never re-arms: the file's `mode`,
`reviewedHead`, verdicts, and `cyclesUsed` carry on, so an event already
recorded gets no second re-review or write, a trigger that arrived while
away is re-reviewed now, and the soft cap counts from `cyclesUsed`. Only the
user's explicit request to re-arm writes a fresh state file.

If the state file is lost, recover from the transcript, never a fresh read:

- **Tracked PR-level list:** never reclassify or guess. If lost, stop as
  `Tracked list lost`.
- Otherwise, re-create the file with every lost field at its lost value:
  `armHead`, `armReview`, `armCounts`, `resolvedBySkill`, and `reviewedHead`
  null, `autoMergeConfirmed` false, `mode` `reReview` unless the transcript
  shows the user's request to approve, `cyclesUsed` from the transcript's
  last snapshot line (else 0), and no verdicts. Never take `armHead` from the
  current head or `armReview` from a fresh read. When `armReview` is re-created
  as null, tell the user that any standing approval of theirs, one from before
  arm included, now ends the watch at the next poll.
