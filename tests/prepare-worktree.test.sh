#!/usr/bin/env bash
# Tests the rebasing-open-prs scripts (prepare-worktree, cleanup-worktree, reconcile, list-prs)
# against throwaway git repositories and a fake gh.
# Usage: bash tests/prepare-worktree.test.sh
#   Prints "ok - <case>" per passing case; exits 1 at the first failure with the reason on stderr.
set -euo pipefail

scripts="$(cd "$(dirname "$0")/.." && pwd)/skills/engineering/rebasing-open-prs/scripts"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Isolate from the caller's git config (signing, hooks, default branch) and fix the identity.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

fail() {
  printf 'not ok - %s\n' "$*" >&2
  exit 1
}

# run <expected-exit> <command...>: stdout lands in $out, stderr in $err.
run() {
  local want=$1 code=0
  shift
  out=$("$@" 2>"$tmp/stderr") || code=$?
  err=$(cat "$tmp/stderr")
  [ "$code" = "$want" ] || fail "expected exit $want, got $code from: $*; stderr: $err"
}

value() { printf '%s\n' "$out" | sed -n "s/^$1=//p"; }

prepare() { run "$1" "$scripts/prepare-worktree.sh" "${@:2}"; }

git init -q --bare -b main "$tmp/origin.git"
git init -q -b main "$tmp/repo"
cd "$tmp/repo"
git commit -q --allow-empty -m init
git remote add origin "$tmp/origin.git"
git push -q origin main:main main:feature/x main:a/b main:a-b main:kept main:stale main:dirty
git fetch -q origin
git clone -q "$tmp/origin.git" "$tmp/other"

# prepare-worktree.sh

prepare 0 feature/x
[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 4 ] &&
  ! printf '%s\n' "$out" | grep -qvE '^(WORKTREE_PATH|CREATED|BRANCH_CREATED|BRANCH)=' ||
  fail "stdout is not four KEY=VALUE lines: $out"
[ "$(value CREATED)/$(value BRANCH_CREATED)/$(value BRANCH)" = true/true/feature/x ] ||
  fail "new worktree and branch: $out"
created_path=$(value WORKTREE_PATH)
case "$created_path" in
  */.rebasing-open-prs-worktrees/feature%2Fx) ;;
  *) fail "unexpected default path: $created_path" ;;
esac
echo "ok - creates worktree and branch; stdout is only four KEY=VALUE lines"

prepare 0 feature/x
[ "$(value CREATED)/$(value BRANCH_CREATED)" = false/false ] && [ "$(value WORKTREE_PATH)" = "$created_path" ] ||
  fail "clean worktree not reused: $out"
echo "ok - reuses a clean worktree that contains origin"

run 0 "$scripts/cleanup-worktree.sh" "$created_path" feature/x false false
[ -d "$created_path" ] || fail "cleanup removed a reused worktree"
echo "ok - cleanup leaves a reused worktree in place"

run 0 "$scripts/cleanup-worktree.sh" "$created_path" feature/x true true
[ ! -e "$created_path" ] && ! git show-ref --verify --quiet refs/heads/feature/x ||
  fail "cleanup kept the worktree or branch it created"
echo "ok - cleanup removes the worktree and branch it created"

prepare 0 a/b
slash_path=$(value WORKTREE_PATH)
prepare 0 a-b
[ "$slash_path" != "$(value WORKTREE_PATH)" ] || fail "a/b and a-b share $slash_path"
echo "ok - distinct branch names get distinct worktree paths"

git branch -q kept origin/kept
prepare 0 kept
[ "$(value CREATED)/$(value BRANCH_CREATED)" = true/false ] || fail "existing local branch: $out"
run 0 "$scripts/cleanup-worktree.sh" "$(value WORKTREE_PATH)" kept true false
git show-ref --verify --quiet refs/heads/kept || fail "cleanup deleted a pre-existing local branch"
echo "ok - reuses a current local branch and cleanup keeps it"

git branch -q stale origin/stale
git -C "$tmp/other" checkout -q stale
git -C "$tmp/other" commit -q --allow-empty -m "remote work"
git -C "$tmp/other" push -q origin stale
git fetch -q origin
prepare 4 stale
case "$err" in *"lacks commits on origin/stale"*) ;; *) fail "stale refusal reason: $err" ;; esac
echo "ok - refuses a local branch missing commits from origin"

prepare 0 dirty
dirty_path=$(value WORKTREE_PATH)
touch "$dirty_path/untracked"
prepare 4 dirty
run 0 "$scripts/cleanup-worktree.sh" "$dirty_path" dirty true true
echo "ok - refuses to reuse a worktree with changes"

git checkout -q -b feature/x origin/feature/x
prepare 4 feature/x
git checkout -q main
echo "ok - refuses the caller's own checkout"

prepare 3 nowhere
prepare 2
echo "ok - names a branch missing on origin and a usage error"

# cleanup-worktree.sh usage

run 2 "$scripts/cleanup-worktree.sh" "$slash_path" a/b true
run 2 "$scripts/cleanup-worktree.sh" "$slash_path" a/b false true
echo "ok - cleanup rejects a wrong argument count and an impossible flag pair"

# reconcile.sh

printf '1\tfeature/x\tmain\t%s\n2\tgone\tmain\t%s\n' \
  "$(git rev-parse origin/feature/x)" "$(git rev-parse origin/main)" >"$tmp/manifest.tsv"
run 0 "$scripts/reconcile.sh" "$tmp/manifest.tsv"
[ "$(printf '%s\n' "$out" | head -n 1)" = FETCH=ok ] || fail "first line is not FETCH=ok: $out"
printf '%s\n' "$out" | grep -q '^PR=1 BRANCH=feature/x CURRENT_OID=[0-9a-f]* REBASED=yes OID_CHANGED=no ' ||
  fail "unchanged branch line: $out"
printf '%s\n' "$out" | grep -q '^PR=2 BRANCH=gone CURRENT_OID=missing ' || fail "missing branch line: $out"
git remote set-url origin "$tmp/absent.git"
run 0 "$scripts/reconcile.sh" "$tmp/manifest.tsv"
git remote set-url origin "$tmp/origin.git"
[ "$(printf '%s\n' "$out" | head -n 1)" = FETCH=failed ] || fail "failed fetch not on stdout: $out"
echo "ok - reconcile reports fetch status on stdout and per-PR remote state"

# list-prs.sh, with a fake gh that prints a fixture

mkdir "$tmp/bin"
printf '#!/usr/bin/env bash\ncat "$GH_FIXTURE"\n' >"$tmp/bin/gh"
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH" GH_FIXTURE="$tmp/prs.json"
cat >"$GH_FIXTURE" <<'EOF'
[
  {"number": 1, "title": "ok", "headRefName": "feature/ok", "baseRefName": "main", "isDraft": false, "isCrossRepository": false, "author": {"login": "a"}, "url": "u1"},
  {"number": 2, "title": "fork", "headRefName": "patch-1", "baseRefName": "main", "isDraft": false, "isCrossRepository": true, "author": {"login": "b"}, "url": "u2"},
  {"number": 3, "title": "unsafe", "headRefName": "x$(id)", "baseRefName": "main", "isDraft": false, "isCrossRepository": false, "author": {"login": "c"}, "url": "u3"},
  {"number": 4, "title": "draft", "headRefName": "wip", "baseRefName": "main", "isDraft": true, "isCrossRepository": false, "author": {"login": "d"}, "url": "u4"}
]
EOF
summary() { printf '%s\n' "$out" | jq -r 'map("\(.number):\(.rebaseable)") | join(",")'; }

run 0 "$scripts/list-prs.sh" --limit 4
[ "$(summary)" = 1:true,2:false,3:false,4:true ] || fail "rebaseable flags: $(summary)"
case "$err" in *warning*) ;; *) fail "no truncation warning at the limit: $err" ;; esac
run 0 "$scripts/list-prs.sh" --skip-drafts
[ "$(summary)" = 1:true,2:false,3:false,4:false ] || fail "--skip-drafts flags: $(summary)"
case "$err" in *warning*) fail "truncation warning below the limit: $err" ;; esac
echo "ok - list-prs skips forks and unsafe names, keeps drafts by default, and warns at the limit"

run 2 "$scripts/list-prs.sh" --author
run 2 "$scripts/list-prs.sh" --limit 0
run 2 "$scripts/list-prs.sh" --bogus
echo "ok - list-prs rejects a missing value, a bad limit, and an unknown flag"
