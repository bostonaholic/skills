---
type: llm
---

PASS if test/cart.test.js, as the reply describes it, drives `checkout` with concrete items and asserts the request the payment service receives or the receipt with a literal amount derived from the items, such as `1250` for two 500-cent items and one 250-cent item, not a value computed by calling `subtotalCents` (SKILL.md, "Write a test that does both").
PASS only if the empty-cart test asserts `EmptyCartError` or that no charge was made, and when it asserts no charge, another test shows a charge happening (SKILL.md, "The contract decides").
FAIL if any test reads src/cart.js as text, asserts that `subtotalCents` was called, or pins the exact message "cart is empty" as the only check of the empty-cart error.
