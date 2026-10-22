// Fails when a rebasing-open-prs script hides git's or jq's own error text: init-run.sh
// refusing stdin with only its own line, or reconcile.sh and write-result.sh falling back to
// RESULT=invalid, FETCH=failed, TIP_COMMITTED=unknown, or head=unknown without the tool's
// reason; or when a fallback value or an exit code changes.
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

const SCRIPTS = resolve("skills/engineering/rebasing-open-prs/scripts");
const INIT_RUN = join(SCRIPTS, "init-run.sh");
const RECONCILE = join(SCRIPTS, "reconcile.sh");
const WRITE_RESULT = join(SCRIPTS, "write-result.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const REAL_GIT = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rebasing-open-prs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, ...args) {
  const result = spawnSync(REAL_GIT, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd, file) {
  writeFileSync(join(cwd, file), `${file}\n`);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
}

// A bare remote with `main` and `feature`, a clone at <dir>/work, and a run directory at
// <dir>/run whose manifest lists PR 1 for `feature` on `main` at its current remote oid.
function world(dir) {
  const remote = join(dir, "remote.git");
  mkdirSync(remote);
  git(remote, "init", "-q", "--bare", "-b", "main");
  const work = join(dir, "work");
  git(dir, "clone", "-q", remote, work);
  git(work, "checkout", "-q", "-b", "main");
  commit(work, "base.txt");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", "feature");
  commit(work, "feature.txt");
  git(work, "push", "-q", "origin", "feature");
  const oid = git(work, "rev-parse", "refs/remotes/origin/feature");
  const run = join(dir, "run");
  mkdirSync(run);
  writeFileSync(join(run, "manifest.tsv"), `1\tfeature\tmain\t${oid}\n`);
  return { work, run };
}

// A `git` first on PATH that runs the real git, except for one subcommand, which writes
// `sentinel` to stderr and exits 128.
function gitShim(dir, subcommand, sentinel) {
  const bin = join(dir, "git-shim");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "git"),
    `#!${BASH}
if [ "$1" = ${JSON.stringify(subcommand)} ]; then
  printf '%s\\n' ${JSON.stringify(sentinel)} >&2
  exit 128
fi
exec ${JSON.stringify(REAL_GIT)} "$@"
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  return bin;
}

function runScript(script, args, { cwd, input = "", pathDirs = [] }) {
  return spawnSync(BASH, [script, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, PATH: [...pathDirs, process.env.PATH].join(":") },
  });
}

function lineStartIndex(text, prefix) {
  return text.split("\n").findIndex((line) => line.startsWith(prefix));
}

test("rebasing-open-prs scripts pass git's and jq's own error text through", async (t) => {
  await t.test("init-run.sh shows jq's parse error before its die line", (st) => {
    const dir = scratch(st);
    const result = runScript(INIT_RUN, ["1"], { cwd: dir, input: "not json\n" });
    assert.equal(result.status, 2, result.stderr);
    const tool = lineStartIndex(result.stderr, "jq: ");
    const own = lineStartIndex(
      result.stderr,
      "init-run.sh: stdin is not the JSON array list-prs.sh prints",
    );
    assert.notEqual(tool, -1, `jq's line is missing from stderr:\n${result.stderr}`);
    assert.ok(tool < own, `jq's line is not before the script's line:\n${result.stderr}`);
    assert.equal(result.stdout, "");
  });

  await t.test("reconcile.sh shows jq's parse error and still reports RESULT=invalid", (st) => {
    const dir = scratch(st);
    const { work, run } = world(dir);
    writeFileSync(join(run, "1.json"), "not json\n");
    const result = runScript(RECONCILE, [run], { cwd: work });
    assert.equal(result.status, 0, result.stderr);
    const tool = lineStartIndex(result.stderr, "jq: ");
    const summary = lineStartIndex(result.stderr, "Reconciled 1 branch(es)");
    assert.notEqual(tool, -1, `jq's line is missing from stderr:\n${result.stderr}`);
    assert.ok(tool < summary, `jq's line is not before the summary line:\n${result.stderr}`);
    assert.match(result.stdout, /^PR=1 BRANCH=feature .* RESULT=invalid STATUS=needs-review /m);
  });

  await t.test("reconcile.sh shows git's fetch error and still reports FETCH=failed", (st) => {
    const dir = scratch(st);
    const { work, run } = world(dir);
    git(work, "remote", "set-url", "origin", join(dir, "missing.git"));
    const result = runScript(RECONCILE, [run], { cwd: work });
    assert.equal(result.status, 0, result.stderr);
    const tool = lineStartIndex(result.stderr, "fatal: ");
    const own = lineStartIndex(result.stderr, "reconcile.sh: git fetch --prune origin failed");
    assert.notEqual(tool, -1, `git's line is missing from stderr:\n${result.stderr}`);
    assert.ok(tool < own, `git's line is not before the script's line:\n${result.stderr}`);
    assert.equal(result.stdout.split("\n")[0], "FETCH=failed");
    assert.match(result.stdout, /^PR=1 BRANCH=feature /m);
  });

  await t.test(
    "reconcile.sh shows git's log error and still reports TIP_COMMITTED=unknown",
    (st) => {
      const dir = scratch(st);
      const { work, run } = world(dir);
      const shim = gitShim(dir, "log", "fatal: git-log-sentinel");
      const result = runScript(RECONCILE, [run], { cwd: work, pathDirs: [shim] });
      assert.equal(result.status, 0, result.stderr);
      const tool = result.stderr.split("\n").indexOf("fatal: git-log-sentinel");
      const summary = lineStartIndex(result.stderr, "Reconciled 1 branch(es)");
      assert.notEqual(tool, -1, `git's line is missing from stderr:\n${result.stderr}`);
      assert.ok(tool < summary, `git's line is not before the summary line:\n${result.stderr}`);
      assert.match(result.stdout, /^PR=1 BRANCH=feature .* TIP_COMMITTED=unknown /m);
    },
  );

  await t.test("write-result.sh shows git's error and still writes head=unknown", (st) => {
    const dir = scratch(st);
    const run = join(dir, "run");
    mkdirSync(run);
    writeFileSync(join(run, "manifest.tsv"), "1\tfeature\tmain\tabc\n");
    const notARepo = join(dir, "not-a-repo");
    mkdirSync(notARepo);
    const result = runScript(
      WRITE_RESULT,
      [run, "1", "feature", "main", "pushed", "0", "passed", "none", notARepo],
      { cwd: dir, input: "a note\n" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(
      lineStartIndex(result.stderr, "fatal: "),
      -1,
      `git's line is missing from stderr:\n${result.stderr}`,
    );
    assert.equal(result.stdout, `RESULT=${join(run, "1.json")}\n`);
    assert.equal(JSON.parse(readFileSync(join(run, "1.json"), "utf8")).head, "unknown");
  });
});
