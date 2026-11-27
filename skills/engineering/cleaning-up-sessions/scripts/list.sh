#!/usr/bin/env bash
#
# List what agent sessions left behind for one repository, and the command
# that removes each item. Deletes nothing; it runs `git fetch --prune` so gone
# upstreams show.
#
#   usage: list.sh [REPO]
#
#   REPO  any directory inside the repository; defaults to the current one
#
# Writes one tab-separated row per item to stdout:
#
#   kind  target  age_days  merged  action  command
#
#   kind      worktree, branch, scratch (a git tree under
#             $CLEANUP_SCRATCH_ROOT/claude-*, default /private/tmp), or port
#             (a listening process whose working directory is in the repo)
#   age_days  whole days since the item last changed
#   merged    yes when its tip is in the default branch or is the head of a
#             merged pull request, else no
#   action    delete, stop, or keep (<reason>)
#   command   what removes it, or - for a keep row
#
# A scratch tree with a commit from the last day also prints a row
#
#   warning  <path>  <age_hours>h  -  keep (commits in the last day)  -
#
# Never proposes the current branch or worktree, the default branch, or
# anything with uncommitted or unpushed commits. A worktree is proposed only
# when merged and unchanged for more than 7 days.
#
# Exit codes:
#
#   0   listed
#   64  usage error: more than one argument, or REPO is not in a git repository
#   69  a required tool is missing

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

if [[ $# -gt 1 ]]; then
  die 64 "usage: $0 [REPO]"
fi
for tool in git awk find; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    die 69 "error: missing required tool: $tool"
  fi
done

start=${1:-.}
if ! here=$(git -C "$start" rev-parse --show-toplevel 2>/dev/null); then
  die 64 "error: not in a git repository: $start"
fi
common=$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)
repo=$(git -C "$here" worktree list --porcelain | awk 'NR == 1 { sub(/^worktree /, ""); print; exit }')
current_branch=$(git -C "$here" symbolic-ref --quiet --short HEAD || true)

worktree_days=7
now=$(date +%s)

g() { git -C "$repo" "$@"; }

if ! g fetch --prune --quiet origin 2>/dev/null; then
  echo "note: git fetch --prune origin failed; upstream state may be stale" >&2
fi

default=$(g symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
if [[ -z $default ]]; then
  if g rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then default=origin/main; else default=main; fi
fi
default_local=${default#origin/}

have_gh=0
if command -v gh >/dev/null 2>&1; then have_gh=1; fi

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }
days_since() { echo $(((now - $1) / 86400)); }
q() { printf '%q' "$1"; }
row() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$@"; }

# The head SHA of every merged pull request matching `gh pr list` ARGS, one per line.
merged_heads() {
  if ((have_gh == 0)); then return 0; fi
  (cd "$repo" && gh pr list --state merged --limit 20 --json headRefOid --jq '.[].headRefOid' "$@" 2>/dev/null) || true
}

# Prints "merged unpushed" (each yes or no) for TIP, whose pull requests come
# from `gh pr list` ARGS after it.
judge() {
  local tip=$1 heads merged=no unpushed=no
  shift
  heads=$(merged_heads "$@")
  if g merge-base --is-ancestor "$tip" "$default" 2>/dev/null; then merged=yes; fi
  if [[ -n $heads ]]; then merged=yes; fi
  if [[ -n $(g rev-list -1 "$tip" --not --remotes 2>/dev/null) ]] &&
    ! grep -qFx "$tip" <<<"$heads"; then
    unpushed=yes
  fi
  echo "$merged $unpushed"
}

# Worktrees, skipping the main one.
deleted_trees=""
checked_out=""
while IFS=$'\x1f' read -r path head branch locked prunable; do
  [[ -n $branch ]] && checked_out+="$branch"$'\n'
  [[ $path == "$repo" ]] && continue
  admin=$common/worktrees/${path##*/}
  if [[ -f $path/.git ]]; then admin=$(awk '/^gitdir: / { sub(/^gitdir: /, ""); print }' "$path/.git"); fi
  changed=$(g log -1 --format=%ct "$head" 2>/dev/null || echo 0)
  for f in "$admin/HEAD" "$admin/index"; do
    t=$(mtime "$f")
    ((t > changed)) && changed=$t
  done
  age=$(days_since "$changed")
  cmd="git -C $(q "$repo") worktree remove $(q "$path")"
  [[ -n $branch ]] && cmd+=" && git -C $(q "$repo") branch -D $(q "$branch")"
  if [[ -n $prunable ]]; then
    row worktree "$path" "$age" - delete "git -C $(q "$repo") worktree prune"
    continue
  fi
  if [[ -n $branch ]]; then
    read -r merged unpushed < <(judge "$head" --head "$branch")
  else
    read -r merged unpushed < <(judge "$head" --search "$head")
  fi
  action=delete
  if [[ $path == "$here" ]]; then action="keep (current)"
  elif [[ -n $locked ]]; then action="keep (locked)"
  elif [[ -n $(git -C "$path" --no-optional-locks status --porcelain 2>/dev/null) ]]; then action="keep (uncommitted)"
  elif [[ $unpushed == yes ]]; then action="keep (unpushed)"
  elif [[ $merged == no ]]; then action="keep (unmerged)"
  elif ((age <= worktree_days)); then action="keep (changed in the last $worktree_days days)"
  fi
  if [[ $action == delete ]]; then deleted_trees+="$path"$'\n'; else cmd=-; fi
  row worktree "$path" "$age" "$merged" "$action" "$cmd"
done < <(g worktree list --porcelain | awk '
  function flush() { if (path != "") print path "\037" head "\037" branch "\037" locked "\037" prunable }
  /^worktree / { flush(); path = substr($0, 10); head = branch = locked = prunable = "" }
  /^HEAD / { head = $2 }
  /^branch / { branch = $2; sub(/^refs\/heads\//, "", branch) }
  /^locked/ { locked = "y" }
  /^prunable/ { prunable = "y" }
  END { flush() }')

# Local branches not checked out anywhere, skipping the default branch.
while IFS=$'\x1f' read -r branch tip track ct; do
  [[ $branch == "$default_local" || $branch == "$current_branch" ]] && continue
  grep -qFx "$branch" <<<"$checked_out" && continue
  read -r merged unpushed < <(judge "$tip" --head "$branch")
  action="keep (unmerged)"
  cmd=-
  if [[ $unpushed == yes ]]; then action="keep (unpushed)"
  elif [[ $merged == yes || $track == "[gone]" ]]; then
    action=delete
    cmd="git -C $(q "$repo") branch -D $(q "$branch")"
  fi
  row branch "$branch" "$(days_since "$ct")" "$merged" "$action" "$cmd"
done < <(g for-each-ref --format='%(refname:short)%1f%(objectname)%1f%(upstream:track)%1f%(committerdate:unix)' refs/heads)

# Git trees in this repo's session scratch directories. A session directory is
# named for its working directory with each / and . replaced by -, so the repo's
# own name is a prefix of its worktrees' names too.
scratch_root=${CLEANUP_SCRATCH_ROOT:-/private/tmp}
encoded=${repo//[\/.]/-}
for top in "$scratch_root"/claude-*/"$encoded"*; do
  [[ -d $top ]] || continue
  while IFS= read -r gitpath; do
    tree=${gitpath%/.git}
    newest=$(git -C "$tree" log --all -1 --format=%ct 2>/dev/null || echo 0)
    newest=${newest:-0}
    age=$(days_since "$newest")
    if ((now - newest < 86400)); then
      row warning "$tree" "$(((now - newest) / 3600))h" - "keep (commits in the last day)" -
      row scratch "$tree" "$age" - "keep (commits in the last day)" -
    elif [[ -f $gitpath ]]; then
      row scratch "$tree" "$age" - "keep (linked worktree; remove it from its repository)" -
    elif [[ -n $(git -C "$tree" rev-list -1 --all --not --remotes 2>/dev/null) ]]; then
      row scratch "$tree" "$age" - "keep (unpushed)" -
    else
      row scratch "$tree" "$age" - delete "rm -rf $(q "$tree")"
    fi
  done < <(find "$top" -maxdepth 6 -name .git -prune -print 2>/dev/null)
done

# Listening processes whose working directory is in the repo or one of its worktrees.
if ! command -v lsof >/dev/null 2>&1; then
  echo "note: lsof is missing; dev servers not listed" >&2
  exit 0
fi
trees=$(g worktree list --porcelain | awk '/^worktree / { print substr($0, 10) }')
while IFS=$'\t' read -r pid port; do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }')
  [[ -n $cwd ]] || continue
  owner=""
  while IFS= read -r t; do
    if [[ $cwd == "$t" || $cwd == "$t"/* ]] && ((${#t} > ${#owner})); then owner=$t; fi
  done <<<"$trees"
  [[ -n $owner ]] || continue
  started=$(ps -o etime= -p "$pid" | awk '{ n = split($1, a, /[-:]/); d = (index($1, "-") ? a[1] : 0); print d + 0 }')
  if grep -qFx "$owner" <<<"$deleted_trees" || [[ ! -d $cwd ]]; then
    row port ":$port pid $pid ($cwd)" "$started" - stop "kill $pid"
  else
    row port ":$port pid $pid ($cwd)" "$started" - "keep (its worktree stays)" -
  fi
done < <(lsof -nP -iTCP -sTCP:LISTEN -Fpn 2>/dev/null | awk '
  /^p/ { pid = substr($0, 2) }
  /^n/ { port = $0; sub(/.*:/, "", port); if (!seen[pid, port]++) print pid "\t" port }')
