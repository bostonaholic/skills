#!/usr/bin/env bash
set -euo pipefail

cat >design.md <<'EOF_1'
# Design: Retry failed webhook deliveries

Status: In review
Owner: acme billing platform team

## Problem

acme-billing sends a webhook to each merchant endpoint when an invoice is paid.
Today a delivery that times out or gets a 5xx response is dropped. The merchant
never learns the invoice was paid, and support gets about 40 tickets a week
about missing payment events.

## Decision

Retry each failed delivery with exponential backoff: 1 minute, 5 minutes, 30
minutes, 2 hours, and 12 hours. After the fifth failed retry, move the delivery
to a dead-letter queue and email the merchant's technical contact. Every
attempt carries the same `Acme-Delivery-Id` header, so a merchant can drop a
duplicate.

Considered: a fixed retry every 10 minutes for 24 hours. Rejected because it
sends up to 144 requests to an endpoint that is down for a day.

## Edge cases

- The endpoint returns a 4xx other than 429: no retry; dead-letter at once.
- The endpoint returns 429: retry, and honor `Retry-After` when it is under 12
  hours.
- After the third failed retry, the delivery moves to the dead-letter queue.
- The merchant deletes the endpoint while retries are pending: cancel them.

## Rollout

1. Ship behind the flag `webhook_retries` for five pilot merchants.
2. Turn the flag on for all merchants after one week with no duplicate-delivery
   complaints.

## Out of scope

- Ordering between deliveries to the same endpoint.

## Open questions

1. How long do we keep dead-lettered deliveries? Owner: Priya, needed by
   2026-11-02.

## Risks

- Load: a merchant outage adds at most five requests per delivery.
- Monitoring: a dashboard of retries and dead-letter rate per merchant.
EOF_1

git init -q
git add -A
