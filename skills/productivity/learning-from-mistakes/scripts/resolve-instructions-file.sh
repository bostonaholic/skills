#!/usr/bin/env bash
#
# Print the absolute path of the instructions file a learned rule goes in.
#
#   usage: resolve-instructions-file.sh HOST SCOPE [--cwd DIR]
#
#   HOST   claude (reads CLAUDE.md) or codex (reads AGENTS.md)
#   SCOPE  project: the file at the root from `git rev-parse --show-toplevel`
#          global:  ~/.claude/CLAUDE.md or ~/.codex/AGENTS.md, from $HOME
#   --cwd  the directory whose repository is the project (default: .)
#
# From that starting file, follows each symlink to the file it resolves to,
# and each import-only file to the file it imports, until neither applies.
# An import-only file holds exactly one non-blank line, of the form `@PATH`.
# PATH is relative to the importing file's directory, absolute, or starts
# with `~/` for $HOME. A file with more than that is the target itself. The
# target need not exist yet.
#
# Writes the resolved absolute path on one line to stdout, and errors to
# stderr.
#
# Exit codes:
#
#   0   the path was printed
#   1   usage error: wrong arguments or an unknown SCOPE
#   2   SCOPE is project and DIR is not inside a git repository
#   3   HOST is not claude or codex, so its instructions file is unknown
#   4   the symlinks or imports form a loop
#   69  SCOPE is project and git is missing

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

usage() {
  die 1 "usage: $0 claude|codex project|global [--cwd DIR]"
}

[[ $# -eq 2 || $# -eq 4 ]] || usage
host=$1
scope=$2
cwd=.
if [[ $# -eq 4 ]]; then
  [[ $3 == --cwd ]] || usage
  cwd=$4
fi

case "$host" in
  claude)
    file_name=CLAUDE.md
    global_dir=$HOME/.claude
    ;;
  codex)
    file_name=AGENTS.md
    global_dir=$HOME/.codex
    ;;
  *)
    die 3 "error: unknown host: $host (expected claude or codex)"
    ;;
esac

case "$scope" in
  project)
    if ! command -v git >/dev/null 2>&1; then
      die 69 "error: missing required tool: git"
    fi
    if ! root=$(git -C "$cwd" rev-parse --show-toplevel); then
      die 2 "error: not inside a git repository: $cwd"
    fi
    path=$root/$file_name
    ;;
  global)
    path=$global_dir/$file_name
    ;;
  *)
    echo "error: unknown scope: $scope (expected project or global)" >&2
    usage
    ;;
esac

# Absolute form of $1 with its directory's symlinks resolved, or $1 unchanged
# when that directory does not exist yet.
absolute() {
  local dir
  if dir=$(cd -P -- "$(dirname -- "$1")" 2>/dev/null && pwd); then
    printf '%s/%s\n' "$dir" "$(basename -- "$1")"
  else
    printf '%s\n' "$1"
  fi
}

# The PATH of an import-only file, or nothing.
import_of() {
  local lines
  lines=$(grep -v '^[[:space:]]*$' -- "$1" || true)
  [[ $lines != *$'\n'* && $lines =~ ^[[:space:]]*@([^[:space:]]+)[[:space:]]*$ ]] || return 0
  printf '%s\n' "${BASH_REMATCH[1]}"
}

seen=$'\n'
path=$(absolute "$path")
while :; do
  if [[ $seen == *$'\n'"$path"$'\n'* ]]; then
    die 4 "error: symlink or import loop at: $path"
  fi
  seen+=$path$'\n'
  if [[ -L $path ]]; then
    next=$(readlink -- "$path")
    [[ $next == /* ]] || next=$(dirname -- "$path")/$next
  elif [[ -f $path ]] && next=$(import_of "$path") && [[ -n $next ]]; then
    case "$next" in
      /*) ;;
      \~/*) next=$HOME/${next#\~/} ;;
      *) next=$(dirname -- "$path")/$next ;;
    esac
  else
    break
  fi
  path=$(absolute "$next")
done

printf '%s\n' "$path"
