---
name: verifying-production-changes
description: Verifies a merged change took effect in production by revision ancestry and cohort sampling. Use when confirming a merged change is live, gating on a deploy reaching the fleet, sequencing deploys, or verifying a one-time migration, backfill, or cleanup. Not for CI or build state; use using-gh-cli.
---

# Verify a production change

Merged is not deployed, and deployed is not verified. This skill covers the
two steps between them.

Deploy-gate steps 1 and 5 and data steps 2 to 4 are delegated under the
[step delegation rules](shared/step-delegation.md); the rest stay in this
session.

## Gate on the deploy

1. **Find the running revision.** Use the endpoint or artifact that names it:
   a status endpoint, a bootstrap manifest, a build-info route. It must report
   a commit sha, not a version string. A read-only subagent given the service
   and the repository path finds it and returns the endpoint or artifact, the
   exact command that reads it, and the sha that command reports.
2. **Fetch first** when the deployed sha is unknown locally. An ancestry check
   against a commit the clone has never seen reports a false negative.
3. **Compare by ancestry, never equality:**

   ```sh
   git merge-base --is-ancestor "$TARGET" "$DEPLOYED"
   ```

   Equality fails as soon as a later deploy lands, and that deploy still
   carries the change. Ancestry also handles a rollback: a revision that
   predates the target does not contain it, so the gate stays closed.

4. **Verify the check both ways** before trusting a long poll. It must report
   not-deployed against the current revision and deployed against the target.
   A gate that cannot fail is not a gate.
5. **Sample the fleet, not one instance.** A load-balanced service answers
   from whichever instance the balancer picks, so one request during a rolling
   deploy describes one instance. Take several samples per poll, require every
   one on target, and require several consecutive clean polls before calling
   it deployed. Report a mixed result as a rollout in progress with the count,
   not as a failure. A read-only `sonnet` subagent runs the polls, given the
   step 1 command, the target sha, and the ancestry check from step 4; it may
   run `git fetch` and returns each poll's on-target and stale counts and the
   final state: deployed, rollout in progress, or not deployed.
6. **State the bound.** "No stale instance observed across N sampled requests"
   is what the method supports. "Fully deployed" overstates it, since the
   balancer can keep hiding an instance. Where the platform reports instance
   counts directly, prefer that and say so.

## Verify the resulting data

For a one-time migration, backfill, or cleanup. Every step here is read-only:
never re-run the task in write mode or repair data as part of verification.
Report any discrepancy instead.

1. **Run report mode first and keep the log.** A task worth verifying has a
   mode that writes nothing. Its log names per-row expectations, which is the
   only pre-image available once the writes have happened.
2. **Split into two cohorts.** Parse the report into the population that
   should change and the population that should not. Both matter: a migration
   that touches too much is as wrong as one that touches too little, and only
   the untouched cohort catches the first. A writer subagent given the log
   path writes only the two cohort files and returns their paths, each
   cohort's count, and the rows the report treated specially.
3. **Sample across the axes that vary,** such as product, platform, and
   lifecycle state. Take a dozen from each cohort, including any row the
   report treated specially: a partial change, a skip, a conflict. Run one
   read-only `sonnet` subagent per cohort, launched together, given that
   cohort's file and the special rows; each returns its sampled row keys with
   their axis values and the report's predicted outcome.
4. **Query read-only and diff predicted against actual.** Agreement on both
   cohorts is the finding. Run one read-only `sonnet` subagent per cohort,
   launched together, given its sample and the read-only query command; each
   returns every row as match or mismatch, with predicted and actual values
   for each mismatch.
5. **Check one fleet-wide invariant.** After the change, the population the
   task was supposed to eliminate should be empty. That single count covers
   every row the sample did not reach.
6. **Reconcile the report's totals** against the post-change counts. When the
   kept count matches the surviving population exactly, the arithmetic closes
   and the sample is confirmation rather than the whole argument.
7. **Name the evidence honestly.** Report-vs-actual agreement plus an empty
   invariant is strong. It is not a row-level pre-image: without one there is
   no independent record of what the deleted rows contained. Say which you
   have.

## Order matters between deploys

When one deploy must precede another, the constraint is usually asymmetric and
worth stating in the PR body: name which order is safe, what breaks in the
unsafe one, and whether the damage self-heals.

Verify that claim against the code on both sides rather than restating an
assumption. A client that "tolerates either order" may drop a signal under one
of them; an unconditional filter upstream of a conditional relabel is the
shape that does it. Read the filter, not the summary.

A one-time task that deletes rows the old renderer still reads is gated on
**both** deploys, and its damage does not self-heal. Say so where the ordering
is written down, because nothing enforces it.
