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

usage() {
  echo "usage: $0 claude|codex project|global [--cwd DIR]" >&2
  exit 1
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
    echo "error: unknown host: $host (expected claude or codex)" >&2
    exit 3
    ;;
esac

case "$scope" in
  project)
    if ! command -v git >/dev/null 2>&1; then
      echo "error: missing required tool: git" >&2
      exit 69
    fi
    if ! root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null); then
      echo "error: not inside a git repository: $cwd" >&2
      exit 2
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
    echo "error: symlink or import loop at: $path" >&2
    exit 4
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
