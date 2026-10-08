---
type: llm
---

PASS if the reply serves the request by following `removing-comments`'s procedure: the reply gives the classification or the counts of the comments in `lib/cache.rb`, and it ends in either way the skill allows. Either (a) it presents the root-cause correction for the FIXME as one named set and asks the user to approve it (SKILL.md:63-66), with the comment-only deletion given as a plan, or (b) it reports counts for reviewed, removed, kept, encoded, unenforced, and unfixed comments, with the root cause reported unfixed (SKILL.md:73-75, :80-82). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the comment deletions, which are graded as a plan.
Grade the plan for the comment deletions. A reply that reports the comment deletions as not done passes when it gives that plan. FAIL if the reply claims the comment deletions happened.
