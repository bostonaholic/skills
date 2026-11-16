// Acceptance tests for improving-codebases/scripts/churn.mjs, run against fixture git repositories
// whose commits carry fixed dates. Fixture commits use a /dev/null global config.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../skills/engineering/improving-codebases/scripts/churn.mjs", import.meta.url),
);

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "improving-codebases-churn-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A repository whose commits each append a line to `files`, dated `date` (YYYY-MM-DD).
function repo(t, commits) {
  const root = tempDir(t);
  const git = (args, env = {}) =>
    execFileSync("git", ["-C", root, ...args], { env: { ...GIT_ENV, ...env }, encoding: "utf8" });
  git(["init", "-q", "-b", "main"]);
  commits.forEach(({ files, date, subject }, index) => {
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), `${index}\n`, { flag: "a" });
    }
    git(["add", "-A"]);
    const stamp = `${date}T12:00:00Z`;
    git(["commit", "-q", "-m", subject ?? `commit ${index}`], {
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
    });
  });
  return { root, commit: git(["rev-parse", "HEAD"]).trim() };
}

function report(t, { root, commit }, groups) {
  const path = join(tempDir(t), "report.json");
  writeFileSync(path, JSON.stringify({ scope: { root, commit }, groups }));
  return path;
}

function churn(...args) {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { ...run, json: run.status === 0 ? JSON.parse(run.stdout) : null };
}

const day = (n) => `2026-01-${String(n).padStart(2, "0")}`;

test("a file in at least 3 commits ranks hot with its partners and newest commits first", (t) => {
  const fixture = repo(t, [
    { files: ["src/a.js", "src/b.js"], date: day(1), subject: "first" },
    { files: ["src/a.js", "src/b.js"], date: day(2), subject: "second" },
    { files: ["src/a.js"], date: day(3), subject: "third" },
    { files: ["src/c.js"], date: day(4), subject: "fourth" },
  ]);
  const path = report(t, fixture, [{ id: "src", files: ["src/a.js", "src/b.js", "src/c.js"] }]);

  const run = churn(path, "src");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.json.ranked, 3);
  assert.deepEqual(
    run.json.hot.map(({ path: file, commits, rank }) => ({ file, commits, rank })),
    [{ file: "src/a.js", commits: 3, rank: 1 }],
  );
  assert.deepEqual(run.json.hot[0].coChanged, [{ path: "src/b.js", commits: 2 }]);
  assert.deepEqual(
    run.json.hot[0].recent.map((commit) => commit.subject),
    ["third", "second", "first"],
  );
});

test("a hot file of another group is left out, and a gap file never ranks", (t) => {
  const edits = (file) => [1, 2, 3].map((n) => ({ files: [file], date: day(n) }));
  const fixture = repo(t, [
    ...edits("package-lock.json"),
    ...edits("lib/x.js"),
    ...edits("src/y.js"),
  ]);
  const groups = [
    { id: "lib", files: ["lib/x.js"] },
    { id: "src", files: ["src/y.js"] },
  ];
  const path = report(t, fixture, groups);

  const run = churn(path, "src");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.json.ranked, 2);
  assert.deepEqual(
    run.json.hot.map((entry) => entry.path),
    ["src/y.js"],
  );
});

test("only the top 10 rank hot, ties broken by path", (t) => {
  const files = Array.from({ length: 11 }, (_, n) => `src/f${String(n).padStart(2, "0")}.js`);
  const fixture = repo(
    t,
    [1, 2, 3].map((n) => ({ files, date: day(n) })),
  );
  const path = report(t, fixture, [{ id: "src", files }]);

  const run = churn(path, "src");

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    run.json.hot.map((entry) => entry.path),
    files.slice(0, 10),
  );
});

test("a commit touching more than 50 inventory files is skipped as a sweep", (t) => {
  const files = Array.from({ length: 51 }, (_, n) => `src/f${n}.js`);
  const fixture = repo(t, [
    { files, date: day(1) },
    { files, date: day(2) },
    { files, date: day(3) },
  ]);
  const path = report(t, fixture, [{ id: "src", files }]);

  const run = churn(path, "src");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.json.sweepsSkipped, 3);
  assert.deepEqual(run.json.hot, []);
});

test("commits older than 365 days before scope.commit do not count", (t) => {
  const fixture = repo(t, [
    { files: ["src/a.js"], date: "2024-01-01" },
    { files: ["src/a.js"], date: "2024-01-02" },
    { files: ["src/a.js"], date: day(1) },
    { files: ["src/a.js"], date: day(2) },
  ]);
  const path = report(t, fixture, [{ id: "src", files: ["src/a.js"] }]);

  const run = churn(path, "src");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.json.since, "2025-01-02");
  assert.deepEqual(run.json.hot, []);
});

test("an unknown group or a malformed report exits 1 and points at the skill", (t) => {
  const fixture = repo(t, [{ files: ["src/a.js"], date: day(1) }]);
  const unknown = churn(report(t, fixture, [{ id: "src", files: ["src/a.js"] }]), "lib");
  const badCommit = churn(report(t, { ...fixture, commit: "HEAD" }, []), "src");

  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /no group with id lib/);
  assert.equal(badCommit.status, 1);
  assert.match(badCommit.stderr, /scope\.commit is not a full commit id/);
  assert.match(unknown.stderr, /\nsee .*improving-codebases\/SKILL\.md\n$/);
});

test("a group id with shell or path characters is a usage error", () => {
  const run = churn("report.json", "../src");

  assert.equal(run.status, 2);
  assert.match(run.stderr, /^churn\.mjs: usage: churn\.mjs /);
});
