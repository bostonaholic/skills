---
type: llm
---

PASS if the reply serves the request by following `using-jq`'s procedure: a jq filter that drops the draft PRs, applied through the in-place edit, which writes jq's output to a temporary file, checks in slurp mode with an exit status (`jq -se`, in any flag spelling) that the temporary file holds exactly one JSON value of the type gh-output.json holds (an array), and only then moves it over gh-output.json (SKILL.md:52-67). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the temp-file edit and `jq -se` check, which is graded as a plan.
Grade the plan for the temp-file edit and `jq -se` check. A reply that reports the temp-file edit and `jq -se` check as not done passes when it gives that plan. FAIL if the reply claims the temp-file edit and `jq -se` check happened.
