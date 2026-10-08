#!/usr/bin/env bash
set -euo pipefail

cat >design.md <<'EOF_1'
# Design: Move nightly report jobs to a job queue

Status: In review

## Problem

Nightly report jobs run from cron on one VM (`reports-01`). When that VM
reboots during the run window, the night's reports never run, and nobody
notices until finance asks for them.

## Decision

Enqueue each report as a job on the managed queue at 01:00 UTC. Workers in the
existing `reports` deployment pull jobs, retry each failed job three times with
backoff, and page the on-call engineer after the last failure. The cron entry
is removed once one week of queue runs matches cron output.

Considered: a second cron VM as a hot standby. Rejected because two VMs can
both run a job, and the reports are not idempotent.

## Rollout

1. Run the queue path beside cron for one week and compare outputs.
2. Remove the cron entry.

## Open Questions

1. How long do we keep failed jobs on the dead-letter queue? Owner: Priya, needed by 2026-11-02.
2. Do the finance exports need a fixed run order? Owner: Sam, needed by 2026-11-02.

## Reversibility

| Decision | Door |
|---|---|
| Managed queue as the scheduler | Two-way |
| Removing the cron entry | Two-way |
EOF_1

git init -q
git add -A
