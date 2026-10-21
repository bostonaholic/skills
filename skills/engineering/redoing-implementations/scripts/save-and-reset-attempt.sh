#!/usr/bin/env bash
#
# Save a previous attempt's files, check both saves, and only then reset those
# files to the commit the attempt started from. Other files are left alone.
#
#   usage: save-and-reset-attempt.sh BASE TOPIC OUT -- FILE...
#
#   BASE   the commit the attempt started from. When HEAD does not resolve (a
#          branch with no commits), BASE must be HEAD and both stand for the
#          empty tree
#   TOPIC  names the branch that keeps the committed part:
#          redo-previous-TOPIC, created at HEAD when BASE is not HEAD
#   OUT    a directory outside the working tree for the saves: empty, or absent
#          with a parent that exists
#   FILE   every file the attempt touched, relative to the repository root,
#          tracked or untracked. The script sorts them itself
#
# Run from the repository root. Requires `git` (2.41 or later, for
# --default-prefix) and `tar` on PATH.
#
# Writes these lines to stdout, in this order, and errors to stderr:
#
#   base=SHA          the commit or tree the tracked files were reset to
#   branch=NAME       the branch holding the committed part, or `none`
#   patch=PATH        the uncommitted tracked changes, or `none`
#   tar=PATH          the untracked files, or `none`
#   tracked=N         tracked files reset
#   untracked=N       untracked files deleted
#   restore=COMMAND   one line per command, in order, that brings the attempt
#                     back when run from the repository root
#
# Exit codes:
#
#   0   saved, checked, and reset
#   1   a save or its check failed; nothing was reset. The branch may exist
#   2   usage error, before anything is written: wrong arguments, not run from
#       a repository root, BASE not a commit or not an ancestor of HEAD, OUT
#       inside the working tree, not empty, or without a parent, a FILE that
#       is a directory or unknown to git, or a branch name invalid or taken
#   3   a required tool is missing
#   4   the reset failed after both saves passed their checks; the saves in
#       OUT are intact

set -euo pipefail

usage() {
  echo "usage: $0 BASE TOPIC OUT -- FILE..." >&2
  exit 2
}

fail() {
  echo "error: $1" >&2
  exit "$2"
}

for tool in git tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "missing required tool: $tool" 3
done

[[ $# -ge 5 && $4 == "--" ]] || usage
base_arg=$1
topic=$2
out=$3
shift 4
files=("$@")

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git working tree" 2
[[ -z $(git rev-parse --show-prefix) ]] || fail "run from the repository root" 2
root=$(pwd -P)

# git's well-known empty tree: the base of a branch with no commits.
empty_tree=$(git hash-object -t tree /dev/null)

if head=$(git rev-parse --verify --quiet 'HEAD^{commit}'); then
  base=$(git rev-parse --verify --quiet "${base_arg}^{commit}") ||
    fail "BASE does not name a commit: $base_arg" 2
  git merge-base --is-ancestor "$base" "$head" ||
    fail "BASE $base_arg is not an ancestor of HEAD" 2
else
  [[ $base_arg == "HEAD" ]] || fail "HEAD has no commits, so BASE must be HEAD" 2
  head=$empty_tree
  base=$empty_tree
fi

branch=none
if [[ $base != "$head" ]]; then
  branch="redo-previous-$topic"
  git check-ref-format --branch "$branch" >/dev/null 2>&1 ||
    fail "not a valid branch name: $branch" 2
  if existing=$(git rev-parse --verify --quiet "refs/heads/$branch"); then
    [[ $existing == "$head" ]] || fail "branch $branch exists and is not at HEAD" 2
  fi
fi

# Resolve OUT to an absolute path without creating it, so a rejected OUT
# leaves nothing behind.
if [[ -d $out ]]; then
  out=$(cd "$out" && pwd -P)
  [[ -z $(ls -A "$out") ]] || fail "OUT is not empty: $out" 2
else
  out=${out%/}
  [[ $out == */* ]] || out=./$out
  [[ -d ${out%/*} ]] || fail "OUT's parent directory does not exist: $out" 2
  out=$(cd "${out%/*}" && pwd -P)/${out##*/}
fi
case "$out/" in
  "$root"/*) fail "OUT is inside the working tree: $out" 2 ;;
esac

# Whether PATH is in tree-ish TREE (always false for the empty tree).
in_tree() {
  [[ $1 != "$empty_tree" && -n $(git ls-tree --name-only "$1" -- "$2") ]]
}

tracked=()    # every tracked path: what the patch covers
resettable=() # tracked paths git restore can match: in the index or BASE
in_head=()    # tracked paths the committed part holds
untracked=()
for file in "${files[@]}"; do
  [[ ! -d $file || -L $file ]] || fail "FILE is a directory, list its files: $file" 2
  if [[ -n $(git ls-files -- "$file") ]] || in_tree "$base" "$file" || in_tree "$head" "$file"; then
    tracked+=("$file")
    if [[ -n $(git ls-files -- "$file") ]] || in_tree "$base" "$file"; then
      resettable+=("$file")
    fi
    if in_tree "$head" "$file"; then in_head+=("$file"); fi
  elif [[ -n $(git ls-files --others -- "$file") ]]; then
    untracked+=("$file")
  else
    fail "FILE is unknown to git and absent: $file" 2
  fi
done

mkdir -p "$out" || fail "could not create $out" 1

# Save the committed part.
if [[ $branch != none ]]; then
  git branch -f "$branch" "$head" >/dev/null || fail "could not create branch $branch" 1
fi

# Save the uncommitted tracked changes, staged or not. --binary keeps binary
# files; --default-prefix overrides a diff.noprefix setting that would make
# git apply misread the paths.
patch=none
if [[ ${#tracked[@]} -gt 0 ]]; then
  git diff --binary --default-prefix "$head" -- "${tracked[@]}" >"$out/previous-attempt.patch" ||
    fail "could not write $out/previous-attempt.patch" 1
  if [[ -s $out/previous-attempt.patch ]]; then
    patch=$out/previous-attempt.patch
    git apply -R --check "$patch" >&2 || fail "the patch does not reverse cleanly: $patch" 1
  else
    rm -f "$out/previous-attempt.patch"
  fi
fi

# Save the untracked files.
tar_file=none
if [[ ${#untracked[@]} -gt 0 ]]; then
  tar_file=$out/untracked.tar
  tar -cf "$tar_file" -- "${untracked[@]}" || fail "could not write $tar_file" 1
  expected=$(printf '%s\n' "${untracked[@]}" | LC_ALL=C sort)
  listed=$(tar -tf "$tar_file" | LC_ALL=C sort) || fail "could not list $tar_file" 1
  [[ $listed == "$expected" ]] || fail "$tar_file does not list every untracked file" 1
fi

# Both saves passed their checks: reset only the attempt's files.
if [[ ${#resettable[@]} -gt 0 ]]; then
  git restore --source="$base" --staged --worktree -- "${resettable[@]}" ||
    fail "git restore failed; the saves in $out are intact" 4
fi
if [[ ${#untracked[@]} -gt 0 ]]; then
  rm -f -- "${untracked[@]}" || fail "could not delete the untracked files; the saves in $out are intact" 4
fi

printf 'base=%s\nbranch=%s\npatch=%s\ntar=%s\ntracked=%s\nuntracked=%s\n' \
  "$base" "$branch" "$patch" "$tar_file" "${#tracked[@]}" "${#untracked[@]}"
if [[ $branch != none && ${#in_head[@]} -gt 0 ]]; then
  printf 'restore=git restore --source=%q --staged --worktree --' "$branch"
  printf ' %q' "${in_head[@]}"
  printf '\n'
fi
if [[ $patch != none ]]; then printf 'restore=git apply %q\n' "$patch"; fi
if [[ $tar_file != none ]]; then printf 'restore=tar -xf %q\n' "$tar_file"; fi
