# CI rerun

Read this under the `CI rerun` or `CI fix` grant, after the cycle's CI report
and before any CI fix.

A rerun pushes nothing but spends CI time, so only a known runner or network
fault qualifies. A red test is never re-run, flaky or not: a rerun that turns
it green hides the flake.

## Each candidate

Candidates are each `newFailures` entry whose log was read this cycle, then
each job carried from an earlier cycle. Run, from any directory:

```bash
node <skill-dir>/scripts/rerun-transient.mjs <pr-url> <head> <jobId> <log-file>
```

Act on its JSON:

- `rerun: true`: report `CI rerun <attempt - 1>/2 for <display name>`, the
  `signature`, and log line `lineNumber` quoted from the log file, fenced and
  labeled untrusted. Make no CI fix for that check this cycle; a later poll
  reports the rerun's result as a new failure.
- `not-transient` or `not-failed`: go on to [CI fix](references/ci-fix.md) under that
  grant; otherwise the CI report stands.
- `head-moved`: drop it; the new head's failures arrive on a later poll.
- `run-in-progress`: GitHub re-runs only a finished run. Carry the job and its
  log file to the next cycle and say so. A carry lost to compaction only skips
  a rerun.
- `rerun-bound`: stop as `CI rerun bound`, naming the check, head SHA,
  `signature`, and the run's `attempt` count.
- Exit 1: report the stderr, count no attempt, and keep watching. Exit 2 or
  127: report the stderr and rerun nothing.

## Bound

At most 2 reruns per workflow run, counted by GitHub as the run's attempt, so
the count survives a compaction. Never re-run a job any other way, such as
`gh run rerun`, and never extend the bound.
