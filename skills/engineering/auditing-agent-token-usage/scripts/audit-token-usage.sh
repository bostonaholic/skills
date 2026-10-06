#!/usr/bin/env bash
# Report context-cost signals from recent Claude Code and Codex sessions.
#
# Reports model usage, session length, inherited subagent routing, and tool
# output that gets re-sent on subsequent turns.
#
# Claude Code transcripts carry no token counts, so its sections measure
# proxies. Codex rollouts carry real per-response usage, so its section
# measures the re-read share directly.
#
#   usage: audit-token-usage.sh [days]
#
#   days  window in days, a positive integer, default 7
#
# Reads, under $HOME:
#
#   .claude/projects/**/*.jsonl   Claude Code transcripts
#   .codex/sessions/**/*.jsonl    Codex rollouts
#   .claude/agents, .claude/plugins/cache   agent definitions that pin model:
#
# Requires jq; everything else is POSIX shell tooling.
#
# Output, on stdout: a plain-text report in six numbered sections.
#
#   [1] Claude turns by model and effort, main chain vs subagent
#   [2] Claude agent spawns by model: explicit, INHERITED, or DEFINITION
#   [3] longest Claude sessions, sessions over 500 turns, and compactions
#   [4] Claude tool results over 10,000 characters
#   [5] Claude MCP tool calls per server
#   [6] Codex turns by model and effort, token totals, and re-read share
#
# With no session file written in the window, it prints one line saying so.
#
# Exit codes:
#
#   0      report printed, or no session files in the window
#   1      jq missing from PATH
#   64     usage: more than one argument, or days not a positive integer
#   other  jq's own status when it cannot read or parse a session file

set -euo pipefail

usage() {
  echo "usage: audit-token-usage.sh [days]   (days: positive integer, default 7)" >&2
  exit 64
}

[[ $# -le 1 ]] || usage
readonly days="${1:-7}"
[[ "$days" =~ ^[1-9][0-9]*$ ]] || usage

readonly claude_projects_directory="${HOME}/.claude/projects"
readonly codex_sessions_directory="${HOME}/.codex/sessions"

command -v jq >/dev/null || {
  echo "missing: jq" >&2
  exit 1
}

# Session files touched in the window. mtime is the session's last write, so a
# long-running session stays in scope for as long as it keeps producing turns.
claude_transcripts=()
if [[ -d "$claude_projects_directory" ]]; then
  while IFS= read -r line; do claude_transcripts+=("$line"); done < <(
    find "$claude_projects_directory" -name '*.jsonl' -mtime "-${days}" 2>/dev/null | sort
  )
fi

codex_sessions=()
if [[ -d "$codex_sessions_directory" ]]; then
  while IFS= read -r line; do codex_sessions+=("$line"); done < <(
    find "$codex_sessions_directory" -name '*.jsonl' -mtime "-${days}" 2>/dev/null | sort
  )
fi

if [[ ${#claude_transcripts[@]} -eq 0 && ${#codex_sessions[@]} -eq 0 ]]; then
  echo "no session transcripts modified in the last ${days} days"
  exit 0
fi

# An Agent type that pins model: in its own definition routes itself, so a spawn
# that omits model: is correctly routed rather than inheriting the caller's.
# Definitions live under ~/.claude/agents and in plugin caches, where the spawn
# names them <plugin>:<agent>. Matching on the bare agent name covers both.
# Project-level .claude/agents definitions are not visible from here.
# Only the first 20 lines are read: that covers the frontmatter, and a prompt
# body that mentions model: must not count as a pin.
claude_definition_directories=()
[[ -d "${HOME}/.claude/agents" ]] && claude_definition_directories+=("${HOME}/.claude/agents")
[[ -d "${HOME}/.claude/plugins/cache" ]] && claude_definition_directories+=("${HOME}/.claude/plugins/cache")
self_routed_agents=$(
  if [[ ${#claude_definition_directories[@]} -gt 0 ]]; then
    find "${claude_definition_directories[@]}" -path '*/agents/*' -name '*.md' 2>/dev/null
  fi |
    while IFS= read -r definition; do
      head -20 "$definition" | awk '
        /^name:/  { sub(/^name:[[:space:]]*/, ""); agent = $0 }
        /^model:/ { pinned = 1 }
        END       { if (agent != "" && pinned) print agent }'
    done | sort -u
)

echo "=== Agent token-cost audit: last ${days} days ==="
echo "    Claude Code: ${#claude_transcripts[@]} transcripts    Codex: ${#codex_sessions[@]} rollouts"
echo

# Every Claude section reads the transcript list; with none, jq would read
# stdin instead, so the five sections are skipped together.
if [[ ${#claude_transcripts[@]} -eq 0 ]]; then
  echo "--- [1-5] Claude Code ---"
  echo "  no Claude Code transcripts in the window"
  echo
else
  echo "--- [1] Claude turns by model and effort (main chain vs subagent) ---"
  jq -r 'select(.type=="assistant")
         | [ (if .isSidechain then "subagent" else "main" end),
             (.message.model // "unknown"),
             (.effort // "-") ]
         | @tsv' "${claude_transcripts[@]}" |
    sort | uniq -c | sort -rn |
    awk 'BEGIN { printf "%8s  %-9s %-26s %s\n", "TURNS", "CHAIN", "MODEL", "EFFORT" }
         { printf "%8d  %-9s %-26s %s\n", $1, $2, $3, $4 }'
  echo

  echo "--- [2] Claude agent spawns: was the model routed? ---"
  echo "A spawn with no model: inherits the caller's model AND effort, unless the"
  echo "agent definition pins one; those are DEFINITION, not a leak."
  jq -r --arg pinned "$self_routed_agents" '
          ($pinned | split("\n") | map(select(length > 0))) as $self_routed
          | select(.type=="assistant")
          | .message.content[]?
          | select(.type=="tool_use" and .name=="Agent")
          | (.input.subagent_type // "-") as $type
          | ($type | sub("^[^:]+:"; "")) as $bare
          | [ (.input.model
               // (if ($self_routed | index($bare)) then "DEFINITION" else "INHERITED" end)),
              $type ]
          | @tsv' "${claude_transcripts[@]}" |
    sort | uniq -c | sort -rn |
    awk 'BEGIN { printf "%8s  %-12s %s\n", "SPAWNS", "MODEL", "AGENT TYPE" }
         { printf "%8d  %-12s %s\n", $1, $2, $3 }
         { total += $1
           if ($2 == "INHERITED") inherited += $1
           if ($2 == "DEFINITION") by_definition += $1 }
         END { if (total)
                 printf "\n  %d of %d spawns (%.0f%%) inherited the caller model\n  %d routed by agent definition\n",
                        inherited, total, 100 * inherited / total, by_definition }'
  echo

  # The top 10 keeps the table readable; the over-500 count covers the rest.
  # awk, not head, cuts the list: head would close the pipe early, and under
  # pipefail the SIGPIPE to sort would abort the script.
  # 500 turns flags sessions far past the 200-turn point where per-call cost
  # has already risen, the clearest candidates for a fresh session.
  echo "--- [3] Longest Claude sessions (per-call cost rises ~1.7x past 200 turns) ---"
  for transcript in "${claude_transcripts[@]}"; do
    turns=$(jq -r 'select(.type=="assistant") | 1' "$transcript" | wc -l | tr -d ' ')
    compactions=$(jq -r 'select(.subtype=="compact_boundary") | 1' "$transcript" | wc -l | tr -d ' ')
    printf '%s\t%s\t%s\n' "$turns" "$compactions" "$(basename "$transcript" .jsonl)"
  done | sort -rn |
    awk 'BEGIN    { printf "%8s  %12s  %s\n", "TURNS", "COMPACTIONS", "SESSION" }
         NR <= 10 { printf "%8d  %12d  %s\n", $1, $2, $3 }'

  sessions_over_500=$(for transcript in "${claude_transcripts[@]}"; do
    jq -r 'select(.type=="assistant") | 1' "$transcript" | wc -l
  done | awk '$1 > 500' | wc -l | tr -d ' ')
  total_compactions=$(jq -r 'select(.subtype=="compact_boundary") | 1' "${claude_transcripts[@]}" | wc -l | tr -d ' ')
  echo "  sessions over 500 turns: ${sessions_over_500}"
  echo "  compactions: ${total_compactions}"
  echo

  # 10,000 characters separates bulk output (file dumps, logs, large diffs)
  # from ordinary results; only bulk output is worth trimming at the source.
  echo "--- [4] Oversized Claude tool results (re-sent on every later turn) ---"
  jq -r 'select(.toolUseResult)
         | (.toolUseResult | tostring | length) as $size
         | select($size > 10000)
         | $size' "${claude_transcripts[@]}" |
    awk '{ count++; total += $1; if ($1 > max) max = $1 }
         END { if (count)
                 printf "  %d results over 10,000 chars: %.1f MB total, largest %d chars\n",
                        count, total / 1048576, max
               else
                 print "  none" }'
  echo

  # A tool named mcp__<server>__<tool> belongs to <server>.
  echo "--- [5] MCP calls per server (a server with none is pure context cost) ---"
  jq -r 'select(.type=="assistant")
         | .message.content[]?
         | select(.type=="tool_use" and (.name // "" | startswith("mcp__")))
         | .name | ltrimstr("mcp__") | split("__")[0]' "${claude_transcripts[@]}" |
    sort | uniq -c | sort -rn |
    awk '{ printf "%8d  %s\n", $1, $2 }
         END { if (!NR) print "  none" }'
  echo "  Configured servers with no calls above are candidates for 'claude mcp remove'."
  echo
fi

echo "--- [6] Codex token cost (real usage, not a proxy) ---"
if [[ ${#codex_sessions[@]} -eq 0 ]]; then
  echo "  no Codex rollouts in the window"
else
  # The top 10 model and effort pairs, cut by awk for the reason given in [3].
  jq -r 'select(.type=="turn_context")
         | [ (.payload.model // "unknown"), (.payload.effort // "-") ]
         | @tsv' "${codex_sessions[@]}" |
    sort | uniq -c | sort -rn |
    awk 'BEGIN    { printf "%8s  %-20s %s\n", "TURNS", "MODEL", "EFFORT" }
         NR <= 10 { printf "%8d  %-20s %s\n", $1, $2, $3 }'

  # usage is per-response; turn_token_usage and thread_token_usage are running
  # totals, so summing those would multiply-count. cached_input is a subset of
  # input, and total = input + output.
  jq -r 'select(.type=="token_usage_record")
         | .payload.usage
         | [ .input_tokens, .cached_input_tokens, .cache_write_input_tokens,
             .output_tokens, .reasoning_output_tokens ]
         | @tsv' "${codex_sessions[@]}" |
    awk -F'\t' '{ input += $1; cached += $2; written += $3; output += $4; reasoning += $5 }
         END { total = input + output
               if (!total) { print "  no token records"; exit }
               printf "\n  input %.1fM  output %.2fM (reasoning %.2fM)  total %.1fM\n",
                      input / 1e6, output / 1e6, reasoning / 1e6, total / 1e6
               printf "  context re-read: %.1fM cached + %.1fM cache-write = %.0f%% of all tokens\n",
                      cached / 1e6, written / 1e6, 100 * (cached + written) / total }'

  codex_compactions=$(jq -r 'select(.type=="compacted") | 1' "${codex_sessions[@]}" | wc -l | tr -d ' ')
  codex_over_500=$(for rollout in "${codex_sessions[@]}"; do
    jq -r 'select(.type=="turn_context") | 1' "$rollout" | wc -l
  done | awk '$1 > 500' | wc -l | tr -d ' ')
  echo "  sessions over 500 turns: ${codex_over_500}"
  echo "  compactions: ${codex_compactions}"
fi
