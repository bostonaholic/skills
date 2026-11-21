---
type: llm
---

PASS if the reply meets this rule: it rewrites `Point` as `Data.define(:x, :y)` and drops the hand-written `initialize`, readers, `==`, `eql?`, and `hash` that `Data` provides (SKILL.md:25-34). Data fits because `Point` has fixed attributes, no behavior or validation, and Ruby 3.3 meets Data's 3.2 floor; the reply need not state these reasons. FAIL if it breaks any part of that rule.
Grade the lib/point.rb edit and the test-suite runs as a plan: a reply that reports them as not done passes. FAIL if the reply claims the edit was made or a test run happened. The caller search is graded apart: a reply that reports a search it ran with Read, Grep, or Glob, with its result, or that gives the `find-callers.sh` run as a plan, passes on that step (SKILL.md:76-88, :97-100).
