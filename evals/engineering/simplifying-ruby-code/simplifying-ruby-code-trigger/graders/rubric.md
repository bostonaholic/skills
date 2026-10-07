---
type: llm
---

PASS if the reply serves the request by following `simplifying-ruby-code`'s procedure: it rewrites `Point`, a value object that only stores attributes, as `Data.define`, `Struct.new`, or a Hash and drops the hand-written `initialize`, readers, and equality (Pattern 2, SKILL.md:36-52). The reply need not name the pattern or explain the rewrite. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the lib/point.rb edit, `rg` caller search, and test-suite runs, which is graded as a plan.
Grade the plan for the lib/point.rb edit, `rg` caller search, and test-suite runs. A reply that reports the lib/point.rb edit, `rg` caller search, and test-suite runs as not done passes when it gives that plan. FAIL if the reply claims the lib/point.rb edit, `rg` caller search, and test-suite runs happened. A reply that reports a caller search it ran, with its result, or that gives the caller search as a plan, passes on that step (SKILL.md:83-92).
