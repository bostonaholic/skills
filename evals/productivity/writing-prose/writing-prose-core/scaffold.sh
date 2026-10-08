#!/usr/bin/env bash
set -euo pipefail

cat >draft.md <<'EOF_1'
# How we cut checkout errors in half

At Acme, checkout is the most important part of the storefront — it is the
moment when a visitor becomes a customer. After careful consideration of the
various signals available to us, we determined that a significant portion of
failed checkouts were being caused by a single dependency — the address
validation service.

The service was slow at peak hours — sometimes taking four seconds to respond —
and the checkout page waited for it before it would let the customer pay. When
it timed out, the customer saw a generic error and, in many cases, simply left.

We made two changes. First, checkout now validates the address in the
background while the customer enters payment details — so a slow response no
longer blocks the page. Second, if validation fails, we accept the address and
flag the order for review by the support team instead of showing an error.

The results were clear. Over the four weeks after the change, failed checkouts
dropped from 2.4% to 1.1% — and support reviewed about 30 flagged orders a day,
nearly all of which shipped without any problem.

It is worth noting that none of this required a new service — just a different
order of operations.
EOF_1

git init -q
git add -A
