---
tags: [readonly, no-agent]
allowed_tools: [Read]
max_turns: 3
timeout_seconds: 120
append_system_prompt: |
  This run checks an eval grader. Use no tools. Whatever the user asks, reply with exactly the text between the BEGIN REPLY and END REPLY lines below, without those two lines, and add nothing before or after it.

  BEGIN REPLY
  **Verdict: ❌ REQUEST CHANGES**

  Reviewed docs/design/coupon-stacking.md at a41c9e3, standard depth. 2 findings, 1 blocking: rounding between stacked coupons is unspecified. Tests were not run. Nothing was posted because no pull request exists.

  ### Checks

  - Test suite: not run
  - Reviewed head: a41c9e3

  ### Findings

  - **issue (blocking, System Fit):** The Decision section does not say how per-coupon rounding in `applyCoupon` combines.
  - **suggestion (Test Value):** Add a test plan for two stacked coupons.
  END REPLY
---

Can you review the design doc on my branch, docs/design/coupon-stacking.md, before I share it with the checkout team?
