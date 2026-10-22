#!/usr/bin/env bash
#
# Check that the current branch can be rebased, resolve its base, record the
# recovery point and push lease, then fetch the base. Everything up to the
# rebase itself. Run from inside the repository.
#
#   usage: prepare-rebase.sh [<pr-number-or-url>]
#
#   <pr-number-or-url>  selects the base: that PR's baseRefName in the
#                       repository its URL names. Without it, the base is the
#                       default branch of the repository `gh repo view`
#                       targets. The branch rebased is always the current one.
#
# Requires `git` and `gh` (authenticated) on PATH.
#
# On success, prints these KEY=VALUE lines to stdout, in this order:
#
#   BRANCH       the current branch
#   RECOVERY     HEAD before anything ran; `git reset --hard` to it to undo
#   PUSH_REMOTE  the remote a plain `git push` sends the branch to
#   PUSH_BRANCH  the branch name on PUSH_REMOTE
#   LEASE        the remote copy's OID as last seen before the fetch, or
#                `none` when the branch has no tracked remote copy
#   BASE         the base branch
#   BASE_REMOTE  the remote whose URL is the base repository
#   MERGES       merge commits on the branch since the fetched base
#
# The lease is read before the fetch: a fetch moves the remote-tracking ref,
# so a lease taken after it would accept commits this branch never saw.
#
# Exit codes, each with a reason on stderr:
#
#   0  ready to rebase onto refs/remotes/<BASE_REMOTE>/<BASE>
#   1  a required tool is missing, no temporary file for gh's stderr can be
#      created, or a git or gh command failed (its stderr is passed through)
#   2  the argument is neither a PR number nor an https:// PR URL
#   3  HEAD is detached, tracked files are modified (each is listed), or a
#      rebase or merge is in progress
#   4  the base is not a valid branch name, or is the current branch
#   5  no remote's URL is the base repository
#   6  the remote copy has commits this branch lacks; nothing was fetched
#   7  LEASE would be none but a PR exists for the branch; nothing was fetched

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
  local code=$1
  shift
  echo "prepare-rebase: $*" >&2
  see_doc
  exit "$code"
}

usage() {
  echo "usage: prepare-rebase.sh [<pr-number-or-url>]" >&2
  see_doc
  exit 2
}

if [[ $# -gt 1 ]]; then
  usage
fi
pr=${1:-}
if [[ -n $pr && ! $pr =~ ^[0-9]+$ && ! $pr =~ ^https://[^/]+/[^/]+/[^/]+/pull/[0-9]+/?$ ]]; then
  die 2 "not a PR number or https:// PR URL: $pr"
fi

for tool in git gh; do
  command -v "$tool" >/dev/null 2>&1 || die 1 "missing required tool: $tool"
done

git rev-parse --git-dir >/dev/null || die 1 "not inside a git repository"

# Preflight: refuse before touching anything.
branch=$(git symbolic-ref --quiet --short HEAD) || die 3 "HEAD is detached; check out a branch"
dirty=$(git status --porcelain --untracked-files=no)
if [[ -n $dirty ]]; then
  printf '%s\n' "$dirty" >&2
  die 3 "tracked files are modified; commit or stash them, then re-run"
fi
for marker in rebase-merge rebase-apply MERGE_HEAD; do
  if [[ -e "$(git rev-parse --git-path "$marker")" ]]; then
    die 3 "a rebase or merge is in progress ($marker); finish or abort it first"
  fi
done

# Base: the PR's base in the PR's repository, else the default branch.
if [[ -n $pr ]]; then
  found=$(gh pr view "$pr" --json baseRefName,url --jq '.baseRefName + " " + .url') ||
    die 1 "gh pr view $pr failed"
  read -r base pr_url <<<"$found"
  repo=$(sed -E 's#^https://[^/]+/([^/]+/[^/]+)/pull/.*#\1#' <<<"$pr_url")
else
  found=$(gh repo view --json defaultBranchRef,nameWithOwner --jq '.defaultBranchRef.name + " " + .nameWithOwner') ||
    die 1 "gh repo view failed"
  read -r base repo <<<"$found"
fi
[[ -n ${base:-} && -n ${repo:-} ]] || die 1 "gh returned no base branch or repository"

git check-ref-format --branch "$base" >/dev/null || die 4 "base is not a valid branch name: $base"
[[ $base != "$branch" ]] || die 4 "the current branch is the base ($base); check out the branch to rebase"

# The remote whose URL ends in OWNER/REPO, with or without .git, compared
# without case because GitHub names are case-insensitive. Not just `origin`:
# in a fork, origin is the fork and the base lives upstream.
repo_lc=$(tr '[:upper:]' '[:lower:]' <<<"$repo")
base_remote=
for remote in $(git remote); do
  url=$(git remote get-url "$remote" | tr '[:upper:]' '[:lower:]')
  case $url in
    *[:/]"$repo_lc" | *[:/]"$repo_lc".git | *[:/]"$repo_lc"/)
      base_remote=$remote
      break
      ;;
  esac
done
[[ -n $base_remote ]] || die 5 "no remote's URL is $repo; add one (git remote add upstream <url>)"

# Recovery point and lease, before any fetch.
recovery=$(git rev-parse HEAD)
push_remote=$(git for-each-ref --format='%(push:remotename)' "refs/heads/$branch")
push_remote=${push_remote:-origin}
if push_ref=$(git rev-parse --symbolic-full-name '@{push}' 2>/dev/null) && [[ -n $push_ref ]]; then
  push_branch=${push_ref#"refs/remotes/$push_remote/"}
  lease=$(git rev-parse "$push_ref")
  git merge-base --is-ancestor "$lease" HEAD ||
    die 6 "remote has commits this branch lacks; integrate them first ($push_ref is at $lease)"
else
  push_branch=$branch
  lease=none
  # A PR with no tracked remote copy means the push target is unknown, and a
  # first push would create a second branch instead of updating the PR's.
  # gh's stderr goes to a file, apart from stdout, because gh can write to
  # stderr on success (GH_DEBUG, for example), and that text must not become
  # the PR number.
  gh_err=$(mktemp) || die 1 "cannot create a temporary file for gh's stderr"
  trap 'rm -f "$gh_err"' EXIT
  # gh reports a branch with no PR as an error; any other error is a failure.
  if found=$(gh pr view --json number --jq .number 2>"$gh_err"); then
    cat "$gh_err" >&2
    die 7 "branch has PR #$found but no tracked remote copy; run gh pr checkout $found or set the upstream"
  fi
  if ! grep -q "no pull requests found" "$gh_err"; then
    cat "$gh_err" >&2
    die 1 "gh pr view failed"
  fi
fi

# Fetch only the base, into its remote-tracking ref.
git fetch --quiet "$base_remote" "+refs/heads/$base:refs/remotes/$base_remote/$base" ||
  die 1 "git fetch $base_remote $base failed"
merges=$(git rev-list --merges --count "refs/remotes/$base_remote/$base..HEAD")

printf '%s=%s\n' \
  BRANCH "$branch" \
  RECOVERY "$recovery" \
  PUSH_REMOTE "$push_remote" \
  PUSH_BRANCH "$push_branch" \
  LEASE "$lease" \
  BASE "$base" \
  BASE_REMOTE "$base_remote" \
  MERGES "$merges"
