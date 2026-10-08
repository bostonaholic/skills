---
name: auditing-agent-token-usage
description: "Audits recent Claude Code and Codex session logs for token and context cost: model routing, inherited subagent models, long sessions, compactions, oversized tool results, and unused MCP servers. Use when asked about agent token usage, context costs, session length, model routing, or cost efficiency."
argument-hint: "[<days>]"
---

# Auditing agent token usage

Run the deterministic audit, then explain its results. The script is the
measurement; do not substitute your own log reading for it.

```sh
"<skill-dir>/scripts/audit-token-usage.sh" <days>
```

`<days>` is a positive integer, default seven unless the user names another
window. The script needs `jq` and reads Claude Code transcripts and Codex
rollouts under the home directory. On a nonzero exit, relay stderr and stop.

## Analyze

- State the window and which sources had data. Claude Code sections, [1] to
  [5], measure transcript proxies such as turn counts and character sizes. The
  Codex section, [6], uses recorded token counts.
- Identify the largest evidenced costs: expensive model usage, inherited
  subagent routing, long sessions, compactions, context re-reading, oversized
  tool results, and configured MCP servers absent from section [5].
- Recommend only changes the output supports: at most three, ranked by
  expected impact, each citing the count or percentage behind it.
- Never present Claude Code proxy values as measured tokens.
- When a source is absent or the script fails, report the missing data or
  prerequisite. Do not infer its usage.
