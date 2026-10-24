---
name: verifying-production-changes
description: Verifies a merged change took effect in production by revision ancestry and cohort sampling, and reports a bound over sampled requests rather than "fully deployed". Use when asked to confirm or report whether a merged change is live or deployed in production, before answering, even when the build-info, status, or deploy output is already in hand; also when gating on a deploy reaching the fleet, sequencing deploys, or verifying a one-time migration, backfill, or cleanup. Not for CI or build state.
---

# Verify a production change

Merged is not deployed, and deployed is not verified.

## Gate on the deploy

Write a command that prints the commit sha one production request is served
by, never a version string, from whatever the service exposes (status
endpoint, build-info route, bootstrap manifest). Where the platform reports
instance revisions directly, prefer that and say so. Then, in a clone of the
service's repository, run:

```sh
scripts/deploy-gate.sh --target <merged-sha> --baseline <prior-prod-sha> -- <command>
```

Raise `--samples` or `--clean-polls` for a large fleet, or set `--interval` and
`--max-polls` to the platform's rollout pace. Its header documents the gate.

- **Exit 0:** write its last line, "No stale instance observed across N
  sampled requests", word for word.
- **Exit 1, `rollout-in-progress`:** report a rollout in progress with the
  on and off counts, not a failure. **`not-deployed`:** report that no sample
  runs the change.
- **Exit 2, 3, or 5:** fix the invocation, sha, or sampling command, then
  rerun.
- **Exit 4:** the baseline already contains the target, so ask which revision
  production ran before this deploy.

- Limit every claim about what production runs to the samples: never "fully
  deployed" or "prod is no longer on the old sha".
- If the script cannot run, read its header and apply its rules to the samples
  you have.
- With every sample on target, still write the sentence above, also when the
  ancestry check is pending.

## Verify the resulting data

For a one-time migration, backfill, or cleanup. Verification is read-only:
never re-run the task in write mode or repair data. Report discrepancies.

- **Use the report-mode log.** Its per-row expectations are the only pre-image
  available once the writes have happened.
- **Check two cohorts:** rows that should change and rows that should not.
  Only the untouched cohort catches a task that touched too much. Sample each
  across the axes that vary, include rows the report treated specially
  (partial, skip, conflict), and diff predicted against actual with read-only
  queries.
- **Check one fleet-wide invariant:** the population the task was meant to
  eliminate is now empty. That count covers every row the sample missed.
- **Reconcile the report's totals** against post-change counts.
- **Name the evidence:** report-vs-actual agreement plus an empty invariant is
  strong, but it is not a row-level pre-image. Without one there is no
  independent record of what deleted rows contained. Say which you have.

## Order between deploys

- When one deploy must precede another, the constraint is usually asymmetric.
- State in the PR body which order is safe, what breaks in the other, and
  whether the damage self-heals.
- Verify that against the code on both sides: a client that "tolerates either
  order" may still drop a signal under one, for example an unconditional filter
  upstream of a conditional relabel.
- A one-time task that deletes rows the old renderer still reads is gated on
  both deploys and does not self-heal; say so where the ordering is written
  down, because nothing enforces it.
