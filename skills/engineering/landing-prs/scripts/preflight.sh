#!/usr/bin/env bash
# Checks that the PR can be landed from the current branch, records the push
# lease, fetches the base, and counts how far behind the base the branch is.
#
# Usage: preflight.sh [<n>]
#   <n>  the PR number, digits only. Without it, the current branch's PR
#
# Run it from the repository, on the PR's head branch. It writes nothing
# except one fetch of the base branch, made after the lease is recorded.
#
# Stdout, on exit 0 only, one KEY=VALUE line each, in this order:
#   PR        the PR number
#   URL       https://<host>/<owner>/<repo>/pull/<n>
#   HOST, OWNER, REPO   split from URL
#   HEAD_REF  the PR's head branch, which is the current branch
#   BASE_REF  the PR's base branch
#   REMOTE    the remote a plain `git push` updates, which holds HEAD_REF
#   LEASE     the commit the remote head held before the fetch
#   BEHIND    commits on <REMOTE>/<BASE_REF> missing from HEAD
#   MERGES    merge commits in <REMOTE>/<BASE_REF>..HEAD
#
# Requires gh (authenticated) and git.
#
# Exit codes, each with its reason on stderr:
#   0    ready to land
#   1    a gh or git command failed unexpectedly; its message is on stderr
#   2    usage: an argument that is not digits, or more than one
#   3    no PR found, or the PR is merged or closed
#   4    the PR head lives in a fork, or the current branch is not its head
#   5    the repository disallows squash merging, or the base name has a
#        character outside [A-Za-z0-9._/-]
#   6    a plain `git push` would not update the PR head
#   7    the remote head has commits this branch lacks
#   8    the branch is behind and the working tree has uncommitted changes
#        to tracked files, so a rebase cannot start
#   127  gh or git is missing
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
  echo "preflight.sh: $2" >&2
  see_doc
  exit "$1"
}

if [ $# -gt 1 ] || { [ $# -eq 1 ] && [[ ! $1 =~ ^[0-9]+$ ]]; }; then
  die 2 "usage: preflight.sh [<n>]   (<n> is the PR number, digits only)"
fi

for tool in gh git; do
  command -v "$tool" >/dev/null 2>&1 || die 127 "missing required tool: $tool"
done

# A PR URL as gh prints it; owner and repo never contain a slash.
url_pattern='^https://([^/]+)/([^/]+)/([^/]+)/pull/([0-9]+)$'
# Base names go into git and gh commands; anything outside this set could be
# read as an option or shell syntax.
ref_pattern='^[A-Za-z0-9._/-]+$'

if ! fields=$(gh pr view "$@" --json number,state,isCrossRepository,headRefName,baseRefName,url \
  --jq '[.number, .state, .isCrossRepository, .headRefName, .baseRefName, .url] | @tsv'); then
  die 3 "no PR found${1:+ for #$1}"
fi
IFS=$'\t' read -r pr state cross head_ref base_ref url <<<"$fields"

[ "$state" = OPEN ] || die 3 "PR #$pr is $state"
[ "$cross" = false ] || die 4 "PR #$pr's head lives in a fork"
current=$(git branch --show-current)
[ "$current" = "$head_ref" ] ||
  die 4 "current branch '${current:-(detached)}' is not PR #$pr's head '$head_ref'; run gh pr checkout $pr"
[[ $url =~ $url_pattern ]] || die 1 "unexpected PR URL: $url"
host=${BASH_REMATCH[1]} owner=${BASH_REMATCH[2]} repo=${BASH_REMATCH[3]}

squash=$(gh repo view "$host/$owner/$repo" --json squashMergeAllowed --jq .squashMergeAllowed) ||
  die 1 "could not read $owner/$repo's merge settings"
[ "$squash" = true ] || die 5 "$owner/$repo disallows squash merging"
[[ $base_ref =~ $ref_pattern ]] || die 5 "base name '$base_ref' has a character outside [A-Za-z0-9._/-]"

remote=$(git for-each-ref --format='%(push:remotename)' "refs/heads/$current")
push=$(git rev-parse --abbrev-ref '@{push}') || push=""
[ -n "$remote" ] && [ "$push" = "$remote/$head_ref" ] ||
  die 6 "git push targets '${push:-nothing}', not ${remote:-<remote>}/$head_ref"
remote_url=$(git remote get-url "$remote")
# The host is not compared: SSH host aliases rename it. GitHub owner and
# repository names are case-insensitive, and remote URLs may end in .git or /.
remote_path=$(printf '%s' "$remote_url" | tr '[:upper:]' '[:lower:]' | sed -e 's#/*$##' -e 's#\.git$##')
want=$(printf '%s/%s' "$owner" "$repo" | tr '[:upper:]' '[:lower:]')
case "$remote_path" in
  */"$want" | *:"$want") ;;
  *) die 6 "remote $remote ($remote_url) is not $owner/$repo" ;;
esac

# Record the lease before the fetch, from the remote head as last seen.
lease=$(git rev-parse '@{push}')
git merge-base --is-ancestor "$lease" HEAD ||
  die 7 "$remote/$head_ref has commits this branch lacks; someone else pushed"

base_tracking="refs/remotes/$remote/$base_ref"
git fetch --quiet "$remote" "+refs/heads/$base_ref:$base_tracking" >&2 ||
  die 1 "git fetch $remote $base_ref failed"
behind=$(git rev-list --count "HEAD..$base_tracking")
merges=$(git rev-list --merges --count "$base_tracking..HEAD")

if [ "$behind" -gt 0 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die 8 "branch is $behind behind $base_ref and the working tree has uncommitted changes"
fi

printf 'PR=%s\nURL=%s\nHOST=%s\nOWNER=%s\nREPO=%s\nHEAD_REF=%s\nBASE_REF=%s\nREMOTE=%s\nLEASE=%s\nBEHIND=%s\nMERGES=%s\n' \
  "$pr" "$url" "$host" "$owner" "$repo" "$head_ref" "$base_ref" "$remote" "$lease" "$behind" "$merges"
