#!/usr/bin/env bash
#
# Gather the raw material for one idea-mining run. Read-only: it runs find,
# git log, and a python3 read of the prompt history, nothing else.
#
#   usage: gather.sh --vault <vault> [--days <days>] [--skills <repo>] <repo>...
#
#   --vault <vault>   notes directory; its Notes/Idea Miner.md and
#                     Notes/idea-miner/ pages are left out of the changed list
#   --days <days>     window in days (default 7, one weekly run)
#   --skills <repo>   skills repository whose origin/main skills/ tree lists
#                     the skills that already exist (optional)
#   <repo>            one or more directories; every git repository directly
#                     under each, plus its worktrees, is scanned
#
# Reads HOME for ~/.claude/history.jsonl and ~/.claude/projects/*/memory.
#
# Writes sections to stdout, each opened by a line `== <section>`:
#
#   notes      vault .md files changed in the window, one path per line
#   daily      daily note paths in the window (Daily Notes/YYYY-MM-DD.md)
#   memory     memory pages changed in the window, one path per line
#   prompts    prompt history in the window: `<date time>\t<project>\t<text>`
#   commits    per repository: `-- <path>` then `git log` lines `<sha> <date> <subject>`
#   skills     existing skill paths from the skills repository, if given
#
# Exit codes:
#
#   0   every section was printed
#   64  usage error: missing --vault, unknown option, or no repository root
#   66  --vault or a repository root is not a directory
#   69  a required tool is missing (git, python3, find)

set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
doc_file=SKILL.md

# Prints `see <absolute path of doc_file>`. It resolves the physical path with
# builtins only, so a symlinked scripts directory or a PATH without dirname
# still names the real file, and a failed resolution never changes the exit.
see_doc() {
  local dir=. real
  if [[ ${BASH_SOURCE[0]} == */* ]]; then dir=${BASH_SOURCE[0]%/*}; fi
  real=$(CDPATH='' cd -P -- "$dir" && pwd -P) || real=$dir
  echo "see ${real%/*}/$doc_file" >&2
}

die() {
  echo "$2" >&2
  see_doc
  exit "$1"
}

vault='' skills='' days=7
roots=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --vault) [[ $# -ge 2 ]] || die 64 "usage: --vault needs a value"; vault=$2; shift 2 ;;
    --days) [[ $# -ge 2 ]] || die 64 "usage: --days needs a value"; days=$2; shift 2 ;;
    --skills) [[ $# -ge 2 ]] || die 64 "usage: --skills needs a value"; skills=$2; shift 2 ;;
    -*) die 64 "usage: unknown option $1" ;;
    *) roots+=("$1"); shift ;;
  esac
done
[[ -n $vault ]] || die 64 "usage: gather.sh --vault <vault> [--days <days>] [--skills <repo>] <repo>..."
[[ ${#roots[@]} -gt 0 ]] || die 64 "usage: name at least one repository root"
[[ $days =~ ^[0-9]+$ ]] || die 64 "usage: --days takes a whole number, got $days"
[[ -d $vault ]] || die 66 "error: vault is not a directory: $vault"
for root in "${roots[@]}"; do
  [[ -d $root ]] || die 66 "error: repository root is not a directory: $root"
done
for tool in git python3 find; do
  command -v "$tool" >/dev/null 2>&1 || die 69 "error: missing required tool: $tool"
done

echo "== notes"
find "$vault" -type f -name '*.md' -mtime "-$days" \
  -not -path '*/.obsidian/*' -not -path '*/.trash/*' \
  -not -path '*/Notes/idea-miner/*' -not -name 'Idea Miner.md' | sort

echo "== daily"
for ((i = 0; i < days; i++)); do
  day=$(date -v-"${i}"d +%F 2>/dev/null || date -d "-${i} day" +%F)
  f="$vault/Daily Notes/$day.md"
  [[ -f $f ]] && echo "$f"
done

echo "== memory"
find "$HOME/.claude/projects" -path '*/memory/*' -type f -mtime "-$days" 2>/dev/null | sort

echo "== prompts"
if [[ -f $HOME/.claude/history.jsonl ]]; then
  python3 -I - "$HOME/.claude/history.jsonl" "$days" <<'PY'
import json, sys, time
path, days = sys.argv[1], int(sys.argv[2])
cutoff = time.time() - days * 86400
for line in open(path):
    try:
        entry = json.loads(line)
    except ValueError:
        continue
    ts = entry.get("timestamp", 0)
    if ts > 1e12:
        ts /= 1000  # stored in milliseconds
    if ts > cutoff:
        when = time.strftime("%Y-%m-%d %H:%M", time.localtime(ts))
        project = (entry.get("project") or "").rsplit("/", 1)[-1]
        text = (entry.get("display") or "").replace("\n", " ")[:200]
        print(f"{when}\t{project}\t{text}")
PY
fi

echo "== commits"
for root in "${roots[@]}"; do
  if git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    repos=("$root")
  else
    repos=()
    for d in "$root"/*/; do
      git -C "$d" rev-parse --git-dir >/dev/null 2>&1 && repos+=("${d%/}")
    done
  fi
  for repo in "${repos[@]}"; do
    git -C "$repo" worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' |
      while IFS= read -r tree; do
        log=$(git -C "$tree" log --since="$days days ago" --format='%h %ad %s' --date=short 2>/dev/null) || continue
        [[ -n $log ]] || continue
        echo "-- $tree"
        echo "$log"
      done
  done
done

echo "== skills"
if [[ -n $skills ]]; then
  git -C "$skills" ls-tree -r --name-only origin/main -- skills 2>/dev/null | grep '/SKILL\.md$' | sed 's#/SKILL\.md$##' || true
fi
