---
type: llm
---

PASS if the reply serves the request by following `simplifying-ruby-code`'s procedure: it rewrites `Point`, a value object that only stores attributes, as `Data.define`, `Struct.new`, or a Hash and drops the hand-written `initialize`, readers, and equality (Pattern 2, SKILL.md:25-34). The reply need not name the pattern or explain the rewrite. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the lib/point.rb edit and the test-suite runs, which are graded as a plan.
Grade the lib/point.rb edit and the test-suite runs as a plan: a reply that reports them as not done passes. FAIL if the reply claims the edit was made or a test run happened. The caller search is graded apart: a reply that reports a search it ran with Read, Grep, or Glob, with its result, or that gives the `find-callers.sh` run as a plan, passes on that step (SKILL.md:76-88, :97-100).
