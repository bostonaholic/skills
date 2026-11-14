---
type: llm
---

PASS only if the reply reports these changes to test/cart.test.js and a passing `npm test` run after them:

- "subtotal is computed with reduce" deleted or replaced, because it reads src/cart.js as text and fails on a refactor that keeps every result (SKILL.md, "Judge each test against two edits").
- "checkout charges the subtotal" compares against a literal amount, `1250`, instead of `subtotalCents(items)`, which the code under test computes.
- "checkout rejects an empty cart" asserts `EmptyCartError` instead of, or as well as, the exact message, and any no-charge assertion is paired with a case where a charge happens (SKILL.md, "The contract decides").

FAIL if the reply changes src/cart.js, or keeps a test that asserts how `checkout` computes the amount rather than what it charges.
