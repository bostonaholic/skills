---
type: llm
---

PASS if the reply meets this rule: the command never redirects jq's output onto config/flags.json itself; it writes the edited JSON to a temporary file, checks in slurp mode with an exit status (`jq -se`, in any flag spelling) that the temporary file holds exactly one JSON value of the type the file holds (an array, so not the `"object"` of the skill's example), and moves the temporary file over config/flags.json only when the edit and that check both succeed (SKILL.md:52-67). FAIL if it breaks any part of that rule.
In slurp mode jq wraps the file's top-level values in one outer array, so `length == 1` counts top-level values and `.[0]` is the file's own value: a check such as `jq -se 'length == 1 and (.[0] | type == "array")' config/flags.json.tmp` tests for exactly one top-level array, not an array nested inside another. A command with no `jq -se` check between the edit and the `mv` fails, even when the reply says it has not run the command.
Grade the plan for the temp-file edit and `jq -se` check. A reply that reports the temp-file edit and `jq -se` check as not done passes when it gives that plan. FAIL if the reply claims the temp-file edit and `jq -se` check happened.
