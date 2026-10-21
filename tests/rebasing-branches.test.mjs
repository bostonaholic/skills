// Fails when prepare-rebase.sh stops refusing a bad argument, a detached HEAD, a
// dirty tree, an operation in progress, an invalid or current-branch base, or a
// repository no remote points at; when it reads the lease after the fetch, fetches
// after a failed ancestry check, or first-pushes a branch that has a PR; when it
// picks a remote by name instead of URL or miscounts merges; or when publish.sh
// pushes without the lease, retries or masks a rejected push, or reports success
// when the remote branch is not the local tip.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/rebasing-branches/scripts");
const PREPARE = join(SCRIPTS, "prepare-rebase.sh");
const PUBLISH = join(SCRIPTS, "publish.sh");

// Git with no user or system config, so host settings such as commit signing
// or push.default never reach the fixtures.
const BASE_ENV = (() => {
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  return env;
})();

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: BASE_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function commit(cwd, file, content = file) {
  writeFileSync(join(cwd, file), `${content}\n`);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
  return git(cwd, "rev-parse", "HEAD");
}

// A fake gh answering from environment variables and logging each call:
//   GH_REPO_VIEW   output of `gh repo view ...` ("<default-branch> <owner/repo>")
//   GH_PR_VIEW     output of `gh pr view <arg> ...` ("<baseRefName> <url>")
//   GH_PR_CURRENT  `gh pr view` for the current branch: a PR number, `none`
//                  for gh's no-PR error, `fail` for any other gh error, or
//                  `silent` for a gh error with empty stderr
//   GH_PR_WARN     a line `gh pr view` for the current branch writes to stderr
//                  before it succeeds, as GH_DEBUG makes gh do
const FAKE_GH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$GH_LOG"
case "$1 $2" in
  "repo view") printf '%s\\n' "$GH_REPO_VIEW" ;;
  "pr view")
    if [[ $3 == --json ]]; then
      case $GH_PR_CURRENT in
        none) echo "no pull requests found for branch \\"x\\"" >&2; exit 1 ;;
        fail) echo "HTTP 401: Bad credentials" >&2; exit 1 ;;
        silent) exit 1 ;;
        *)
          if [[ -n \${GH_PR_WARN:-} ]]; then printf '%s\\n' "$GH_PR_WARN" >&2; fi
          printf '%s\\n' "$GH_PR_CURRENT"
          ;;
      esac
    else
      printf '%s\\n' "$GH_PR_VIEW"
    fi
    ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 1 ;;
esac
`;

// A temporary world: a bare remote at <dir>/remotes/acme/api.git with `main`, a
// clone at <dir>/work on branch `feature` one commit ahead, and a fake gh.
function world(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rebasing-branches-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), FAKE_GH);
  chmodSync(join(bin, "gh"), 0o755);

  const remote = join(dir, "remotes/acme/api.git");
  mkdirSync(remote, { recursive: true });
  git(remote, "init", "-q", "--bare", "-b", "main");
  const work = join(dir, "work");
  mkdirSync(work);
  git(work, "init", "-q", "-b", "main");
  git(work, "remote", "add", "origin", remote);
  commit(work, "base.txt");
  git(work, "push", "-q", "-u", "origin", "main");
  git(work, "switch", "-q", "-c", "feature");
  commit(work, "feature.txt");

  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const env = {
    ...BASE_ENV,
    PATH: `${bin}:${process.env.PATH}`,
    GH_LOG: log,
    GH_REPO_VIEW: "main acme/api",
    GH_PR_VIEW: "",
    GH_PR_CURRENT: "none",
  };
  return {
    dir,
    remote,
    work,
    env,
    ghCalls: () => readFileSync(log, "utf8").split("\n").filter(Boolean),
  };
}

// Pushes a new commit to <branch> on the bare remote from a second clone.
function advanceRemote(w, branch, file) {
  const other = join(w.dir, `other-${file}`);
  git(w.dir, "clone", "-q", "-b", branch, w.remote, other);
  const oid = commit(other, file);
  git(other, "push", "-q", "origin", branch);
  return oid;
}

function run(w, script, args = [], env = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd: w.work,
    env: { ...w.env, ...env },
    encoding: "utf8",
  });
}

function keys(stdout) {
  return Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
}

test("prepare-rebase.sh exits 2 on a bad argument before any gh call", (t) => {
  const w = world(t);
  for (const args of [
    ["abc"],
    ["http://github.com/acme/api/pull/1"],
    ["https://github.com/acme/api"],
    ["1", "2"],
  ]) {
    const result = run(w, PREPARE, args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
  }
  assert.deepEqual(w.ghCalls(), []);
});

test("prepare-rebase.sh exits 3 on a detached HEAD, a dirty tree, or an operation in progress", (t) => {
  const w = world(t);
  git(w.work, "switch", "-q", "--detach");
  let result = run(w, PREPARE);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /HEAD is detached/);
  git(w.work, "switch", "-q", "feature");

  writeFileSync(join(w.work, "feature.txt"), "edited\n");
  result = run(w, PREPARE);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /M feature\.txt/);
  assert.match(result.stderr, /tracked files are modified/);
  git(w.work, "checkout", "--", "feature.txt");

  for (const marker of ["rebase-merge", "rebase-apply", "MERGE_HEAD"]) {
    const path = join(w.work, ".git", marker);
    writeFileSync(path, "");
    result = run(w, PREPARE);
    assert.equal(result.status, 3, marker);
    assert.match(result.stderr, new RegExp(`in progress \\(${marker}\\)`));
    rmSync(path);
  }
  assert.deepEqual(w.ghCalls(), []);
});

test("prepare-rebase.sh exits 4 on an invalid base name or when the current branch is the base", (t) => {
  const w = world(t);
  let result = run(w, PREPARE, [], { GH_REPO_VIEW: "bad..name acme/api" });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /not a valid branch name: bad\.\.name/);

  result = run(w, PREPARE, [], { GH_REPO_VIEW: "feature acme/api" });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /current branch is the base/);
});

test("prepare-rebase.sh exits 5 when no remote's URL is the base repository", (t) => {
  const w = world(t);
  const result = run(w, PREPARE, [], { GH_REPO_VIEW: "main acme/other" });
  assert.equal(result.status, 5);
  assert.match(result.stderr, /no remote's URL is acme\/other/);
});

test("prepare-rebase.sh exits 6 without fetching when the remote copy has commits the branch lacks", (t) => {
  const w = world(t);
  git(w.work, "push", "-q", "-u", "origin", "feature");
  const remoteOnly = commit(w.work, "pushed.txt");
  git(w.work, "push", "-q");
  git(w.work, "reset", "-q", "--hard", "HEAD~1");
  commit(w.work, "local.txt");
  const trackedMain = git(w.work, "rev-parse", "refs/remotes/origin/main");
  advanceRemote(w, "main", "upstream.txt");

  const result = run(w, PREPARE);
  assert.equal(result.status, 6);
  assert.match(result.stderr, /remote has commits this branch lacks; integrate them first/);
  assert.match(result.stderr, new RegExp(remoteOnly));
  assert.equal(
    git(w.work, "rev-parse", "refs/remotes/origin/main"),
    trackedMain,
    "base not fetched",
  );
});

test("prepare-rebase.sh exits 7 without fetching when a branch with no remote copy has a PR", (t) => {
  const w = world(t);
  const result = run(w, PREPARE, [], { GH_PR_CURRENT: "42" });
  assert.equal(result.status, 7);
  assert.match(result.stderr, /PR #42 .* gh pr checkout 42/);
  assert.deepEqual(w.ghCalls().at(-1), "pr view --json number --jq .number");
});

test("prepare-rebase.sh keeps gh's stderr out of the PR number when gh succeeds", (t) => {
  const w = world(t);
  const result = run(w, PREPARE, [], { GH_PR_CURRENT: "42", GH_PR_WARN: "gh-debug-sentinel" });
  assert.equal(result.status, 7);
  assert.match(result.stderr, /^gh-debug-sentinel$/m);
  assert.match(result.stderr, /^prepare-rebase: branch has PR #42 but .* gh pr checkout 42 /m);
});

test("prepare-rebase.sh exits 1 when gh fails for a reason other than no PR", (t) => {
  const w = world(t);
  const result = run(w, PREPARE, [], { GH_PR_CURRENT: "fail" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bad credentials/);
});

test("prepare-rebase.sh prints no blank line when gh fails with empty stderr", (t) => {
  const w = world(t);
  const result = run(w, PREPARE, [], { GH_PR_CURRENT: "silent" });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.split("\n")[0], "prepare-rebase: gh pr view failed");
});

test("prepare-rebase.sh records the lease before fetching only the base", (t) => {
  const w = world(t);
  const lease = git(w.work, "rev-parse", "HEAD");
  git(w.work, "push", "-q", "-u", "origin", "feature");
  const head = commit(w.work, "more.txt");
  const newMain = advanceRemote(w, "main", "upstream.txt");
  advanceRemote(w, "feature", "teammate.txt");

  const result = run(w, PREPARE);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(keys(result.stdout), {
    BRANCH: "feature",
    RECOVERY: head,
    PUSH_REMOTE: "origin",
    PUSH_BRANCH: "feature",
    LEASE: lease,
    BASE: "main",
    BASE_REMOTE: "origin",
    MERGES: "0",
  });
  assert.deepEqual(
    result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=")[0]),
    ["BRANCH", "RECOVERY", "PUSH_REMOTE", "PUSH_BRANCH", "LEASE", "BASE", "BASE_REMOTE", "MERGES"],
  );
  assert.equal(git(w.work, "rev-parse", "refs/remotes/origin/main"), newMain, "base fetched");
  assert.equal(
    git(w.work, "rev-parse", "refs/remotes/origin/feature"),
    lease,
    "only the base fetched",
  );
});

test("prepare-rebase.sh reports LEASE=none for a branch with no remote copy and no PR", (t) => {
  const w = world(t);
  const result = run(w, PREPARE);
  assert.equal(result.status, 0, result.stderr);
  const out = keys(result.stdout);
  assert.equal(out.LEASE, "none");
  assert.equal(out.PUSH_REMOTE, "origin");
  assert.equal(out.PUSH_BRANCH, "feature");
});

test("prepare-rebase.sh takes a PR's base from the remote whose URL matches, and counts merges", (t) => {
  const w = world(t);
  // origin becomes a fork; the PR's repository is reachable only as upstream,
  // under a differently cased path.
  const fork = join(w.dir, "remotes/me/api.git");
  git(w.dir, "clone", "-q", "--bare", w.remote, fork);
  const upstream = join(w.dir, "remotes/upstream/Acme/API.git");
  git(w.dir, "clone", "-q", "--bare", w.remote, upstream);
  git(w.work, "remote", "set-url", "origin", fork);
  git(w.work, "remote", "add", "upstream", upstream);
  advanceRemote({ ...w, remote: upstream }, "main", "upstream.txt");
  const other = join(w.dir, "release-clone");
  git(w.dir, "clone", "-q", upstream, other);
  git(other, "push", "-q", "origin", "main:release");

  git(w.work, "switch", "-q", "-c", "side", "main");
  commit(w.work, "side.txt");
  git(w.work, "switch", "-q", "feature");
  git(w.work, "merge", "-q", "--no-ff", "--no-edit", "side");

  const result = run(w, PREPARE, ["https://github.com/acme/api/pull/12"], {
    GH_PR_VIEW: "release https://github.com/acme/api/pull/12",
  });
  assert.equal(result.status, 0, result.stderr);
  const out = keys(result.stdout);
  assert.equal(out.BASE, "release");
  assert.equal(out.BASE_REMOTE, "upstream");
  assert.equal(out.MERGES, "1");
  assert.equal(
    git(w.work, "rev-parse", "refs/remotes/upstream/release"),
    git(other, "rev-parse", "HEAD"),
  );
  assert.ok(
    w
      .ghCalls()
      .includes(
        'pr view https://github.com/acme/api/pull/12 --json baseRefName,url --jq .baseRefName + " " + .url',
      ),
  );
});

test("publish.sh exits 2 on a wrong argument count or a malformed lease", (t) => {
  const w = world(t);
  for (const args of [
    [],
    ["feature", "origin", "feature"],
    ["feature", "origin", "feature", "abc123"],
  ]) {
    const result = run(w, PUBLISH, args);
    assert.equal(result.status, 2, JSON.stringify(args));
  }
});

test("publish.sh exits 1 when the local branch does not exist", (t) => {
  const w = world(t);
  const result = run(w, PUBLISH, ["missing", "origin", "missing", "none"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no local branch: missing/);
});

test("publish.sh first-pushes with LEASE=none and sets the upstream", (t) => {
  const w = world(t);
  const head = git(w.work, "rev-parse", "HEAD");
  const result = run(w, PUBLISH, ["feature", "origin", "feature", "none"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `PUSHED=${head}\n`);
  assert.equal(git(w.remote, "rev-parse", "refs/heads/feature"), head);
  assert.equal(git(w.work, "rev-parse", "--abbrev-ref", "feature@{upstream}"), "origin/feature");
});

test("publish.sh exits 3 without forcing when LEASE=none and the push is not a fast-forward", (t) => {
  const w = world(t);
  const remoteOnly = advanceRemote(w, "main", "upstream.txt");
  git(w.work, "switch", "-q", "main");
  commit(w.work, "diverged.txt");
  const result = run(w, PUBLISH, ["main", "origin", "main", "none"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /rejected/);
  assert.equal(git(w.remote, "rev-parse", "refs/heads/main"), remoteOnly);
});

test("publish.sh force-pushes a rewritten branch under a current lease", (t) => {
  const w = world(t);
  git(w.work, "push", "-q", "-u", "origin", "feature");
  const lease = git(w.work, "rev-parse", "HEAD");
  git(w.work, "commit", "-q", "--amend", "-m", "rewritten");
  const head = git(w.work, "rev-parse", "HEAD");
  const result = run(w, PUBLISH, ["feature", "origin", "feature", lease]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `PUSHED=${head}\n`);
  assert.equal(git(w.remote, "rev-parse", "refs/heads/feature"), head);
});

test("publish.sh exits 3 and leaves the remote alone when the lease is stale", (t) => {
  const w = world(t);
  git(w.work, "push", "-q", "-u", "origin", "feature");
  const lease = git(w.work, "rev-parse", "HEAD");
  const teammate = advanceRemote(w, "feature", "teammate.txt");
  git(w.work, "fetch", "-q", "origin");
  git(w.work, "commit", "-q", "--amend", "-m", "rewritten");
  const result = run(w, PUBLISH, ["feature", "origin", "feature", lease]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /stale info|rejected/);
  assert.equal(git(w.remote, "rev-parse", "refs/heads/feature"), teammate);
});

test("publish.sh exits 4 when the remote branch is not the local tip after the push", (t) => {
  const w = world(t);
  const base = git(w.work, "rev-parse", "main");
  // A hook that moves the branch right after accepting the push.
  const hook = join(w.remote, "hooks/post-receive");
  writeFileSync(hook, `#!/usr/bin/env bash\ngit update-ref refs/heads/feature ${base}\n`);
  chmodSync(hook, 0o755);
  const result = run(w, PUBLISH, ["feature", "origin", "feature", "none"]);
  assert.equal(result.status, 4);
  assert.match(result.stderr, new RegExp(`origin feature is ${base}, not the local tip`));
});
