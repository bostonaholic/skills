#!/usr/bin/env bash
# Tests the rebasing-open-prs scripts (prepare-worktree, cleanup-worktree, init-run, write-result,
# check-range-diff, reconcile, list-prs) against throwaway git repositories and a fake gh.
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
git push -q origin main:main main:feature/x main:a/b main:a-b main:kept main:stale main:ahead main:dirty
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

git branch -q ahead "$(git commit-tree -p origin/ahead -m unpushed 'origin/ahead^{tree}')"
prepare 4 ahead
case "$err" in *"1 commit(s) not on origin/ahead"*) ;; *) fail "ahead refusal reason: $err" ;; esac
echo "ok - refuses a local branch with commits not on origin"

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

# init-run.sh

cat >"$tmp/prs-init.json" <<'EOF'
[
  {"number": 1, "headRefName": "feature/x", "baseRefName": "main", "rebaseable": true},
  {"number": 2, "headRefName": "nowhere", "baseRefName": "main", "rebaseable": true},
  {"number": 3, "headRefName": "kept", "baseRefName": "main", "rebaseable": false}
]
EOF
runs_dir="$(git rev-parse --absolute-git-dir)/rebasing-open-prs"
run 0 "$scripts/init-run.sh" 1 2 3 4 <"$tmp/prs-init.json"
init_run=$(value RUN)
case "$init_run" in "$runs_dir"/*) ;; *) fail "run directory not under the git common dir: $out" ;; esac
[ "$(cat "$init_run/manifest.tsv")" = "$(printf '1\tfeature/x\tmain\t%s' "$(git rev-parse origin/feature/x)")" ] ||
  fail "manifest: $(cat "$init_run/manifest.tsv")"
case "$err" in *"#2: nowhere not on origin"*"#3: not a rebaseable"*"#4: not a rebaseable"*) ;; *) fail "skip lines: $err" ;; esac
echo "ok - init-run writes a manifest of the confirmed PRs on origin and names each skipped one"

before=$(find "$runs_dir" -mindepth 1 -maxdepth 1 | wc -l)
run 3 "$scripts/init-run.sh" 2 3 <"$tmp/prs-init.json"
[ "$(find "$runs_dir" -mindepth 1 -maxdepth 1 | wc -l)" = "$before" ] || fail "init-run left a run directory after exit 3"
run 2 "$scripts/init-run.sh" </dev/null
run 2 "$scripts/init-run.sh" 1x <"$tmp/prs-init.json"
run 2 "$scripts/init-run.sh" 1 1 <"$tmp/prs-init.json"
run 2 "$scripts/init-run.sh" 1 <<<'{}'
echo "ok - init-run exits 3 with no directory when every PR is skipped, and 2 on bad input"

# write-result.sh

mkdir "$tmp/run"
: >"$tmp/run/manifest.tsv"
prepare 0 a/b
note_path=$(value WORKTREE_PATH)
run 0 "$scripts/write-result.sh" "$tmp/run" 7 a/b main pushed 2 'failed(lint)' true "$note_path" <<'EOF'
it's $HOME and `id`
second line
EOF
[ "$(value RESULT)" = "$tmp/run/7.json" ] || fail "RESULT line: $out"
jq -e --arg head "$(git -C "$note_path" rev-parse HEAD)" '
  . == {pr: 7, branch: "a/b", base: "main", status: "pushed", conflicts: 2, verify: "failed(lint)",
        worktree: "created", head: $head, note: "it'"'"'s $HOME and `id` second line"}' "$tmp/run/7.json" >/dev/null ||
  fail "result file: $(cat "$tmp/run/7.json")"
run 0 "$scripts/write-result.sh" "$tmp/run" 7 a/b main error 0 skipped none none <<<replaced
jq -e '.status == "error" and .worktree == "none" and .head == "unknown" and .note == "replaced"' "$tmp/run/7.json" >/dev/null ||
  fail "rewrite did not replace: $(cat "$tmp/run/7.json")"
[ -z "$(find "$tmp/run" -name '.*')" ] || fail "write-result left a temporary file"
echo "ok - write-result writes the note verbatim on one line and replaces an earlier file"

w() { run 2 "$scripts/write-result.sh" "$@" <<<n; }
w "$tmp/run" 7 a/b main merged 0 passed true none
w "$tmp/run" 7 a/b main pushed -1 passed true none
w "$tmp/run" 7 a/b main pushed 0 failed true none
w "$tmp/run" 7 a/b main pushed 0 passed maybe none
w "$tmp/run" x a/b main pushed 0 passed true none
w "$tmp" 7 a/b main pushed 0 passed true none
w "$tmp/run" 7 a/b main pushed 0 passed true
echo "ok - write-result rejects a bad status, count, verify, created, PR, run directory, and arity"

# check-range-diff.sh, in a repository whose origin/main is a plain ref

git init -q -b main "$tmp/rd"
rd() { git -C "$tmp/rd" "$@"; }
rd commit -q --allow-empty -m init
rd checkout -q -b pr
echo b >"$tmp/rd/b" && rd add b && rd commit -q -m addb
echo c >"$tmp/rd/c" && rd add c && rd commit -q -m addc
pre=$(rd rev-parse HEAD)
addb=$(rd rev-parse HEAD~1)
rd checkout -q main
echo b >"$tmp/rd/b" && rd add b && rd commit -q -m "addb upstream"
rd update-ref refs/remotes/origin/main main
rd checkout -q pr
rd rebase -q origin/main 2>/dev/null
run 0 "$scripts/check-range-diff.sh" "$tmp/rd" main "$pre"
[ "$out" = "UPSTREAM $addb addb" ] || fail "upstream commit line: $out"
echo "ok - check-range-diff accepts a commit whose patch is already in the base"

rebased=$(rd rev-parse HEAD)
rd commit -q --allow-empty -m extra
run 4 "$scripts/check-range-diff.sh" "$tmp/rd" main "$pre"
printf '%s\n' "$out" | grep -q '^NEW [0-9a-f]\{40\} extra$' || fail "new commit line: $out"
printf '%s\n' "$err" | grep -q '^see ' && fail "exit 4 is a stdout outcome, but stderr has a see line: $err"
rd reset -q --hard origin/main
run 3 "$scripts/check-range-diff.sh" "$tmp/rd" main "$pre"
printf '%s\n' "$out" | grep -q "^DROPPED $pre addc$" || fail "dropped commit line: $out"
printf '%s\n' "$err" | grep -q '^see ' && fail "exit 3 is a stdout outcome, but stderr has a see line: $err"
rd reset -q --hard "$rebased"
echo "ok - check-range-diff exits 3 on a dropped commit and 4 on a new one"

run 2 "$scripts/check-range-diff.sh" "$tmp/rd" main
run 2 "$scripts/check-range-diff.sh" "$tmp/rd" nobase "$pre"
run 2 "$scripts/check-range-diff.sh" "$tmp/rd" main 0000000000000000000000000000000000000000
echo "ok - check-range-diff rejects a wrong arity, a missing base, and an unknown pre_oid"

# reconcile.sh

cur() { git rev-parse "origin/$1"; }
zero=0000000000000000000000000000000000000000
{
  printf '1\tfeature/x\tmain\t%s\n' "$(cur feature/x)"
  printf '2\tgone\tmain\t%s\n' "$zero"
  printf '3\ta/b\tmain\t%s\n' "$(cur a/b)"
  printf '4\ta-b\tmain\t%s\n' "$zero"
  printf '5\tkept\tmain\t%s\n' "$zero"
  printf '6\tfeature/x\tstale\t%s\n' "$(cur feature/x)"
  printf '8\tahead\tstale\t%s\n' "$zero"
  printf '9\tdirty\tnobase\t%s\n' "$(cur dirty)"
  printf '10\tdirty\tmain\t%s\n' "$(cur dirty)"
  printf '11\tkept\tmain\t%s\n' "$zero"
} >"$tmp/run/manifest.tsv"
res() { echo note | "$scripts/write-result.sh" "$tmp/run" "$1" b main "$2" 0 skipped none none >/dev/null; }
res 1 already-up-to-date
res 3 pushed
res 4 conflicts-flagged
res 11 pushed
echo '{' >"$tmp/run/10.json"
run 0 "$scripts/reconcile.sh" "$tmp/run"
[ "$(printf '%s\n' "$out" | head -n 1)" = FETCH=ok ] || fail "first line is not FETCH=ok: $out"
printf '%s\n' "$out" | grep -q '^PR=1 BRANCH=feature/x CURRENT_OID=[0-9a-f]* REBASED=yes OID_CHANGED=no ' ||
  fail "unchanged branch line: $out"
expect() {
  printf '%s\n' "$out" | grep -q "^PR=$1 .* RESULT=$2 STATUS=$3 NEEDS_REVIEW=$4$" ||
    fail "PR $1: want RESULT=$2 STATUS=$3 NEEDS_REVIEW=$4 in: $out"
}
expect 1 present already-up-to-date no
expect 2 missing branch-gone no
expect 3 present needs-review yes
expect 4 present conflicts-flagged yes
expect 5 missing pushed no
expect 6 missing error no
expect 8 missing needs-review yes
expect 9 missing needs-review yes
expect 10 invalid needs-review yes
expect 11 present pushed no
echo "ok - reconcile derives each status from git and the result file"

git remote set-url origin "$tmp/absent.git"
run 0 "$scripts/reconcile.sh" "$tmp/run"
git remote set-url origin "$tmp/origin.git"
[ "$(printf '%s\n' "$out" | head -n 1)" = FETCH=failed ] || fail "failed fetch not on stdout: $out"
run 2 "$scripts/reconcile.sh" "$tmp/nowhere"
echo "ok - reconcile reports a failed fetch on stdout and rejects a missing manifest"

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
  {"number": 4, "title": "draft", "headRefName": "wip", "baseRefName": "main", "isDraft": true, "isCrossRepository": false, "author": {"login": "d"}, "url": "u4"},
  {"number": 5, "title": "bump", "headRefName": "dependabot/npm_and_yarn/x-1.2.3", "baseRefName": "main", "isDraft": false, "isCrossRepository": false, "author": {"login": "app/dependabot", "is_bot": true}, "url": "u5"}
]
EOF
summary() { printf '%s\n' "$out" | jq -r 'map("\(.number):\(.rebaseable)") | join(",")'; }

run 0 "$scripts/list-prs.sh" --limit 5
[ "$(summary)" = 1:true,2:false,3:false,4:true,5:false ] || fail "rebaseable flags: $(summary)"
printf '%s\n' "$out" | jq -e '.[] | select(.number == 5) | .skipReason | test("merging-dependabot-prs")' >/dev/null ||
  fail "Dependabot skip reason does not name merging-dependabot-prs: $out"
case "$err" in *warning*) ;; *) fail "no truncation warning at the limit: $err" ;; esac
run 0 "$scripts/list-prs.sh" --skip-drafts
[ "$(summary)" = 1:true,2:false,3:false,4:false,5:false ] || fail "--skip-drafts flags: $(summary)"
case "$err" in *warning*) fail "truncation warning below the limit: $err" ;; esac
echo "ok - list-prs skips forks, unsafe names, and Dependabot PRs, keeps drafts by default, and warns at the limit"

run 2 "$scripts/list-prs.sh" --author
run 2 "$scripts/list-prs.sh" --limit 0
run 2 "$scripts/list-prs.sh" --bogus
echo "ok - list-prs rejects a missing value, a bad limit, and an unknown flag"
