---
type: regex
pattern: 'amountCents, subtotalCents\('
target: { source: file, path: test/cart.test.js }
match: not_contains
---
