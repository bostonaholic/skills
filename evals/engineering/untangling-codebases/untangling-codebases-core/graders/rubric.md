---
type: llm
---

PASS if the reply meets every part of this rule: it lists problems with `path:line` before any change (SKILL.md:25-38), including the subtotal and tax logic copied between lib/pricing.rb and lib/invoice.rb with the `1.08` literal duplicating `TAX_RATE`, the `legacy_invoice_text` pass-through wrapper, the `"WELCOME5"` coupon branch as a special case, and the swallowed `rescue StandardError` in lib/mailer.rb; it gives a decision log where each fix is followed by the problems it removes, with one fix removing the duplicated total rather than patching each copy (SKILL.md:39-42); it plans to keep behavior unchanged and run test/pricing_test.rb (SKILL.md:43-55); and it does not offer or apply a comment or test pass, since the user skipped both (SKILL.md:20-24). FAIL if it breaks any part of that rule.
Grade the edits as a plan. FAIL if the reply claims a file was edited or a test ran.
