// Fails when deploy-gate.sh stops exiting 2 on bad usage or outside a git
// repository, stops fetching a sha the clone has not seen, compares by equality
// instead of ancestry, skips its both-ways self-check, accepts a mixed poll as
// clean, stops resetting the clean-poll streak on a mixed poll, changes its
// poll and result lines or the bound sentence, or stops failing loud on a
// broken sampling command.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/engineering/verifying-production-changes/scripts/deploy-gate.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Isolate git from the host's config, which may require signed commits.
const GIT_ENV = {
  PATH: process.env.PATH,
  HOME: tmpdir(),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "deploy-gate-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// An origin with the history baseline -> target -> later, and a clone that has
// seen only baseline, so every other sha must be fetched. `stray` is a commit
// in no repository the clone can fetch from.
function repo(t) {
  const dir = scratch(t);
  const origin = join(dir, "origin.git");
  const author = join(dir, "author");
  const clone = join(dir, "clone");
  git(dir, "init", "--quiet", "--bare", "-b", "main", origin);
  git(dir, "clone", "--quiet", origin, author);
  const commit = (name) => {
    git(author, "commit", "--quiet", "--allow-empty", "-m", name);
    return git(author, "rev-parse", "HEAD");
  };
  const baseline = commit("baseline");
  git(author, "push", "--quiet", "origin", "main");
  git(dir, "clone", "--quiet", origin, clone);
  const target = commit("target");
  const later = commit("later");
  git(author, "push", "--quiet", "origin", "main");
  const stray = commit("stray");
  return { dir, clone, baseline, target, later, stray };
}

// A sampling command that prints one line of `shas` per call, in order.
function sampler(dir, shas) {
  const list = join(dir, "samples.txt");
  const count = join(dir, "count");
  writeFileSync(list, shas.join("\n") + "\n");
  writeFileSync(count, "0");
  const path = join(dir, "sample.sh");
  writeFileSync(
    path,
    `#!${BASH}\nn=$(($(<'${count}') + 1))\necho "$n" >'${count}'\nsed -n "\${n}p" '${list}'\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function gate(cwd, args, cmd) {
  return spawnSync(BASH, [SCRIPT, ...args, "--interval", "0", "--", ...cmd], {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
  });
}

function gateRun(t, shas, { samples = 2, cleanPolls = 2, maxPolls = 5, target, baseline } = {}) {
  const r = repo(t);
  const args = [
    "--target",
    target ?? r.target,
    "--baseline",
    baseline ?? r.baseline,
    "--samples",
    String(samples),
    "--clean-polls",
    String(cleanPolls),
    "--max-polls",
    String(maxPolls),
  ];
  const run = gate(r.clone, args, [
    sampler(
      r.dir,
      shas.map((pick) => pick(r)),
    ),
  ]);
  return { r, run };
}

const BASELINE = (r) => r.baseline;
const TARGET = (r) => r.target;
const LATER = (r) => r.later;

test("deploy-gate.sh exits 2 on bad usage", (t) => {
  const dir = scratch(t);
  for (const args of [
    [],
    ["--target", "abc1234", "--", "true"],
    ["--target", "abc1234", "--baseline", "def5678"],
    ["--target", "abc1234", "--baseline", "def5678", "--samples", "0", "--", "true"],
    ["--target", "abc1234", "--baseline", "def5678", "--interval", "soon", "--", "true"],
    ["--target", "abc1234", "--baseline", "def5678", "--bogus", "--", "true"],
    ["--target"],
  ]) {
    const run = spawnSync(BASH, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: GIT_ENV });
    assert.equal(run.status, 2, JSON.stringify(args));
    assert.match(run.stderr, /usage: |error: /);
    assert.equal(run.stdout, "");
  }
});

test("deploy-gate.sh exits 2 outside a git repository", (t) => {
  const dir = scratch(t);
  const run = gate(dir, ["--target", "abc1234", "--baseline", "def5678"], ["true"]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /not inside a git repository/);
});

test("deploy-gate.sh exits 3 when the target cannot be resolved even after a fetch", (t) => {
  const r = repo(t);
  const run = gate(r.clone, ["--target", r.stray, "--baseline", r.baseline], ["true"]);
  assert.equal(run.status, 3);
  assert.match(run.stderr, new RegExp(`cannot resolve ${r.stray}`));
});

test("deploy-gate.sh exits 4 when the self-check finds the target already in the baseline", (t) => {
  const r = repo(t);
  const run = gate(r.clone, ["--target", r.baseline, "--baseline", r.target], [sampler(r.dir, [])]);
  assert.equal(run.status, 4);
  assert.match(run.stderr, /self-check failed: target .* is already in baseline/);
});

test("deploy-gate.sh reports deployed with the bound after consecutive clean polls, by ancestry", (t) => {
  const { run } = gateRun(t, [LATER, TARGET, LATER, LATER]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "poll 1 on-target 2/2\npoll 2 on-target 2/2\ndeployed samples=4\n" +
      "No stale instance observed across 4 sampled requests\n",
  );
  assert.match(run.stderr, /fetching origin/);
});

test("deploy-gate.sh restarts the clean streak after a mixed poll", (t) => {
  const { run } = gateRun(t, [TARGET, TARGET, TARGET, BASELINE, TARGET, TARGET, TARGET, TARGET]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "poll 1 on-target 2/2\npoll 2 on-target 1/2\npoll 3 on-target 2/2\npoll 4 on-target 2/2\n" +
      "deployed samples=4\nNo stale instance observed across 4 sampled requests\n",
  );
});

test("deploy-gate.sh reports a mixed last poll at max polls as a rollout in progress", (t) => {
  const { run } = gateRun(t, [BASELINE, TARGET, TARGET, BASELINE], { maxPolls: 2 });
  assert.equal(run.status, 1);
  assert.equal(
    run.stdout,
    "poll 1 on-target 1/2\npoll 2 on-target 1/2\nrollout-in-progress on=1 off=1\n",
  );
  assert.doesNotMatch(run.stderr, /^see /m);
});

test("deploy-gate.sh reports a clean last poll short of the streak as off=0", (t) => {
  const { run } = gateRun(t, [BASELINE, BASELINE, TARGET, TARGET], { maxPolls: 2 });
  assert.equal(run.status, 1);
  assert.equal(
    run.stdout,
    "poll 1 on-target 0/2\npoll 2 on-target 2/2\nrollout-in-progress on=2 off=0\n",
  );
});

test("deploy-gate.sh reports not-deployed when no sample is on target, as after a rollback", (t) => {
  const { run } = gateRun(t, [TARGET, TARGET, BASELINE, BASELINE], { maxPolls: 2 });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "poll 1 on-target 2/2\npoll 2 on-target 0/2\nnot-deployed\n");
  assert.doesNotMatch(run.stderr, /^see /m);
});

test("deploy-gate.sh exits 3 when a sampled sha cannot be resolved", (t) => {
  const { run } = gateRun(t, [(r) => r.stray]);
  assert.equal(run.status, 3);
  assert.match(run.stderr, /cannot resolve/);
});

test("deploy-gate.sh exits 5 when the sampling command fails or prints a non-sha", (t) => {
  const r = repo(t);
  const args = ["--target", r.target, "--baseline", r.baseline];
  const failed = gate(r.clone, args, ["false"]);
  assert.equal(failed.status, 5);
  assert.match(failed.stderr, /sampling command failed: false/);

  const version = gate(r.clone, args, ["echo", "2026.10.07.3"]);
  assert.equal(version.status, 5);
  assert.match(version.stderr, /printed something other than one sha: 2026\.10\.07\.3/);
});

// A `git` first on PATH that runs the real git, except for the exact argument list `failing`,
// which writes `sentinel` to stderr and exits 128.
function gitShim(dir, failing, sentinel) {
  const bin = join(dir, "git-shim");
  mkdirSync(bin, { recursive: true });
  const realGit = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(
    join(bin, "git"),
    `#!${BASH}
if [ "$*" = ${JSON.stringify(failing.join(" "))} ]; then
  printf '%s\\n' ${JSON.stringify(sentinel)} >&2
  exit 128
fi
exec ${JSON.stringify(realGit)} "$@"
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  return bin;
}

test("deploy-gate.sh passes git's own error text through", async (t) => {
  await t.test("shows git's rev-parse --git-dir error before its exit 2 line", (st) => {
    const r = repo(st);
    const shim = gitShim(
      r.dir,
      ["rev-parse", "--git-dir"],
      "fatal: git-dir-sentinel: detected dubious ownership",
    );
    const run = spawnSync(
      BASH,
      [SCRIPT, "--target", r.target, "--baseline", r.baseline, "--interval", "0", "--", "true"],
      { cwd: r.clone, encoding: "utf8", env: { ...GIT_ENV, PATH: `${shim}:${GIT_ENV.PATH}` } },
    );
    assert.equal(run.status, 2, run.stderr);
    const lines = run.stderr.split("\n");
    const tool = lines.indexOf("fatal: git-dir-sentinel: detected dubious ownership");
    const own = lines.indexOf("error: not inside a git repository");
    assert.notEqual(tool, -1, `git's line is missing from stderr:\n${run.stderr}`);
    assert.ok(tool < own, `git's line is not before the script's line:\n${run.stderr}`);
    assert.equal(run.stdout, "");
  });

  await t.test("shows git's commit-resolve error before its exit 3 line", (st) => {
    const r = repo(st);
    const shim = gitShim(
      r.dir,
      ["rev-parse", "--quiet", "--verify", `${r.stray}^{commit}`],
      "fatal: git-resolve-sentinel",
    );
    const run = spawnSync(
      BASH,
      [SCRIPT, "--target", r.stray, "--baseline", r.baseline, "--interval", "0", "--", "true"],
      { cwd: r.clone, encoding: "utf8", env: { ...GIT_ENV, PATH: `${shim}:${GIT_ENV.PATH}` } },
    );
    assert.equal(run.status, 3, run.stderr);
    const lines = run.stderr.split("\n");
    const tool = lines.indexOf("fatal: git-resolve-sentinel");
    const own = lines.indexOf(
      `error: cannot resolve ${r.stray} to a commit, even after fetching origin`,
    );
    assert.notEqual(tool, -1, `git's line is missing from stderr:\n${run.stderr}`);
    assert.ok(tool < own, `git's line is not before the script's line:\n${run.stderr}`);
    assert.equal(run.stdout, "");
  });
});
