# After a compaction

Read this when the conversation was compacted during a watch.

Re-read the state file and re-run the poll. If it is lost, recover from the
transcript, never a fresh read:

- **Tracked PR-level list:** never reclassify or guess. If lost, stop as
  `Tracked list lost`.
- Otherwise, re-create the file with every lost field at its lost value:
  `armHead`, `armCounts`, and `resolvedBySkill` null, `autoMergeConfirmed`
  false, and no verdicts. Never take `armHead` from the current head.
