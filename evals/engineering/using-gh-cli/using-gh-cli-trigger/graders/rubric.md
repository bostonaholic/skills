---
type: llm
---

PASS if the reply serves the request by following `using-gh-cli`'s procedure: it reports what broke from the failed-job log of PR 42's failing `unit-tests` check, the `spec/cache_spec.rb` example expecting an entry older than `TTL_SECONDS` to read as nil, which got the cached body instead (SKILL.md:104-106). The reply need not name the run ID or the command. FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable.
