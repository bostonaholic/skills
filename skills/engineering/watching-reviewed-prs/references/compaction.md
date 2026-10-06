# Compaction

After a context compaction, re-derive the live state from GitHub: re-fetch the
viewer login, re-run the poll, and recompute the tracked set, the gate, and
the current auto-merge state. Then continue polling.

GitHub cannot return the arm-time baselines. Recover them from the transcript:

- **The arm-time head SHA** (arm report, every snapshot line). When no copy
  survives, the approval's unrecoverable-baseline rule applies.
- **The arm-time auto-merge state, and whether its confirmation was granted**
  (arm report, every snapshot line). When lost, treat the run as having no
  arm-time auto-merge confirmation.
- **The arm-time tracked count per shape** (arm report, cycle-0 snapshot).
  When lost, say so in the approval body in place of the count comparison.
- **The tracked PR-level item list** (arm report, by URL). It is not
  re-derivable: re-running the classification re-reads bodies and could reach
  a different answer than the list the user saw. When no copy survives, never
  reclassify or guess; stop as `Tracked list lost`. A watch that cannot say
  what it tracks must not approve.
- **Which threads the skill resolved** versus the author (snapshot lines), for
  the `<R>` disclosure. When lost, say so in the approval body in place of the
  count.

Two more are re-derivable from GitHub, which wins when it disagrees with the
transcript:

- **Which replies were already rebutted.** The viewer's own replies are on the
  thread, so the last one shows which author reply was answered. Write nothing
  for a reply that already carries a rebuttal beneath it.
- **The re-review verdicts.** When no copy survives in the snapshot lines,
  re-run the re-review over every settled tracked item. A verdict is never
  assumed passed.
