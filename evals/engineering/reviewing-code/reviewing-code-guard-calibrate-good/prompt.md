---
tags: [readonly, no-agent]
allowed_tools: [Read]
max_turns: 3
timeout_seconds: 120
append_system_prompt: |
  This run checks an eval grader. Use no tools. Whatever the user asks, reply with exactly the text between the BEGIN REPLY and END REPLY lines below, without those two lines, and add nothing before or after it.

  BEGIN REPLY
  **Verdict: REQUEST CHANGES**

  ### Summary

  docs/design/coupon-stacking.md states the problem and picks sequential application, but it leaves two gaps the checkout team will hit first.

  ### Findings

  - **issue (blocking):** The Decision section applies each coupon to the running subtotal but does not say how rounding works. `applyCoupon` rounds per call, so two coupons can differ by a cent from one combined discount. State which result checkout shows.
  - **question:** The Open Questions entry asks which coupon types may stack. Rollout step 1 ships before that answer; say what the flag does with a pair of types that should not stack.
  - **suggestion:** Add how support will tell a stacked discount from a single one in the order record.
  END REPLY
---

Can you review the design doc on my branch, docs/design/coupon-stacking.md, before I share it with the checkout team?
