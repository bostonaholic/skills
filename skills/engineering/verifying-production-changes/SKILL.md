---
name: verifying-production-changes
description: Verifies a merged change took effect in production by revision ancestry and cohort sampling, and reports a bound over sampled requests rather than "fully deployed". Use when asked to confirm or report whether a merged change is live or deployed in production, before answering, even when the build-info, status, or deploy output is already in hand; also when gating on a deploy reaching the fleet, sequencing deploys, or verifying a one-time migration, backfill, or cleanup. Not for CI or build state; use using-gh-cli.
---

# Verify a production change

Merged is not deployed, and deployed is not verified.

## Gate on the deploy

- **Read a commit sha, not a version string,** from whatever the service
  exposes (status endpoint, build-info route, bootstrap manifest).
- **Fetch before comparing.** An ancestry check against a commit the clone has
  never seen reports a false negative.
- **Compare by ancestry, never equality:**

  ```sh
  git merge-base --is-ancestor "$TARGET" "$DEPLOYED"
  ```

  Equality fails as soon as a later deploy lands, though that deploy still
  carries the change. Ancestry also keeps the gate closed after a rollback.

- **Test the gate both ways** before trusting a long poll: it must report
  not-deployed against the current revision and deployed against the target.
  A gate that cannot fail is not a gate.
- **Sample the fleet.** Behind a load balancer one request describes one
  instance. Take several samples per poll, require every one on target, and
  require several consecutive clean polls. Report a mixed result as a rollout
  in progress with counts, not a failure.
- **State the bound honestly:** when every sample is on target, write "No
  stale instance observed across N sampled requests" word for word, with N
  filled in, also when the ancestry check is still pending. Limit every claim
  about what production runs to the samples: never "fully deployed" or "prod
  is no longer on the old sha". Where the platform reports instance revisions
  directly, prefer that and say so.

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

When one deploy must precede another, the constraint is usually asymmetric.
State in the PR body which order is safe, what breaks in the other, and whether
the damage self-heals. Verify that against the code on both sides: a client
that "tolerates either order" may still drop a signal under one, for example
an unconditional filter upstream of a conditional relabel. A one-time task
that deletes rows the old renderer still reads is gated on both deploys and
does not self-heal; say so where the ordering is written down, because nothing
enforces it.
