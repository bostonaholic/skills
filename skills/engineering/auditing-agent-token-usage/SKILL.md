---
name: auditing-agent-token-usage
description: "Audits recent Claude Code and Codex session logs for token and context cost: model routing, inherited subagent models, long sessions, compactions, oversized tool results, and unused MCP servers. Use when asked about agent token usage, context costs, session length, model routing, or cost efficiency."
argument-hint: "[<days>]"
---

# Auditing agent token usage

Run the deterministic audit, then explain its results. The window defaults to
seven days unless the user names another.

## Requirements

The script needs `jq`; everything else it runs is POSIX shell tooling. Check
with `command -v jq`. When it prints nothing, report that `jq` is missing and
stop.

## Run

Resolve `<skill-dir>` to this skill's absolute directory and run:

```sh
"<skill-dir>/scripts/audit-token-usage.sh" <days>
```

`<days>` is a positive integer. The script reads Claude Code transcripts and
Codex rollouts under the home directory, written within the window, and prints
six numbered sections. Exit 64 means the window was rejected; exit 1 means
`jq` is missing; any other nonzero exit means `jq` could not read a session
file. On a nonzero exit, relay stderr and stop.

## Analyze

- State the window and which sources had data. Claude Code sections, [1] to
  [5], measure transcript proxies such as turn counts and character sizes. The
  Codex section, [6], uses recorded token counts.
- Identify the largest evidenced costs: expensive model usage, inherited
  subagent routing, long sessions, compactions, context re-reading, oversized
  tool results, and configured MCP servers absent from section [5].
- Recommend only changes the output supports. Rank at most three by expected
  impact.
- Never present Claude Code proxy values as measured tokens.
- When a source is absent or the script fails, report the missing data or
  prerequisite. Do not infer its usage.

Keep the response concise. Cite the exact count or percentage behind each
conclusion.
