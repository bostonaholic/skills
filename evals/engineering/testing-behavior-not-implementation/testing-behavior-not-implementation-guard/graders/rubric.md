---
type: llm
---

PASS if the reply says `checkout` throws `EmptyCartError` for an empty cart without charging, and otherwise calls `payments.charge` with `{ amountCents, currency: "USD" }`, where `amountCents` is the sum of quantity times unit cents.
FAIL if the reply rewrites, grades, or proposes changes to the tests in test/cart.test.js, or changes any file.
