---
type: llm
---

PASS if the reply meets this rule: it rewrites `Point` as `Data.define(:x, :y)` and drops the hand-written `initialize`, readers, `==`, `eql?`, and `hash` that `Data` provides (SKILL.md:25-34). Data fits because `Point` has fixed attributes, no behavior or validation, and Ruby 3.3 meets Data's 3.2 floor; the reply need not state these reasons. FAIL if it breaks any part of that rule.
Grade the plan for the lib/point.rb edit, `rg` caller search, and test-suite runs. A reply that reports the lib/point.rb edit, `rg` caller search, and test-suite runs as not done passes when it gives that plan. FAIL if the reply claims the lib/point.rb edit, `rg` caller search, and test-suite runs happened. A reply that reports a caller search it ran, with its result, or that gives the caller search as a plan, passes on that step (SKILL.md:76-82, :94-97).
