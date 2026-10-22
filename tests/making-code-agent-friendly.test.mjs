// Tests for skills/engineering/making-code-agent-friendly/scripts/contention.mjs. The
// repository cases build throwaway git repositories under the OS temp directory; git there
// reads only an empty global config plus the identity and signing flags each commit passes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  coupledPairs,
  hotFiles,
  medianDirsPerCommit,
  parseArgs,
  parseLog,
  sequences,
  splitBulk,
} from "../skills/engineering/making-code-agent-friendly/scripts/contention.mjs";

const SCRIPT = resolve("skills/engineering/making-code-agent-friendly/scripts/contention.mjs");
const DOC = resolve("skills/engineering/making-code-agent-friendly/SKILL.md");

// ---------------------------------------------------------------------------------------------
// Fixtures and helpers

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "contention-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Git sees only the empty config file named here, never the developer's own, and no
// repository above the temp directory.
function isolatedGitEnv(dir) {
  const config = join(dir, "empty.gitconfig");
  writeFileSync(config, "");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: config,
    GIT_CEILING_DIRECTORIES: dir,
  };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

function gitIn(repo, env, args) {
  const run = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout;
}

function newRepo(t) {
  const dir = tempDir(t);
  const env = isolatedGitEnv(dir);
  const repo = join(dir, "repo");
  mkdirSync(repo);
  gitIn(repo, env, ["init", "-q"]);
  let edits = 0;
  // Each commit appends a unique line to every listed file, so every file really changes.
  const commit = (files) => {
    edits += 1;
    for (const file of files) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), `edit ${edits}\n`, { flag: "a" });
    }
    gitIn(repo, env, ["add", "--", ...files]);
    gitIn(repo, env, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      `commit ${edits}`,
    ]);
  };
  return { dir, repo, env, commit };
}

function run(args, { cwd, env }) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: "utf8" });
}

function lastLine(stderr) {
  return stderr.replace(/\n$/, "").split("\n").at(-1);
}

const REGISTRY = "config/registry.json";
const ROUTES = "src/api/routes.js";
const CLIENT = "web/client.js";
const SIBLING_A = "src/a.js";
const SIBLING_B = "src/b.js";
const MIGRATIONS = ["db/migrate/0001_users.sql", "db/migrate/0002_posts.sql"];
const LATEST_MIGRATION = "db/migrate/0010_tags.sql";
const BULK = Array.from({ length: 51 }, (_, i) => `vendor/file-${String(i).padStart(2, "0")}.txt`);

// Seven scanned commits, then one 51-file commit. Worked by hand:
// registry in commits 1-5 and 7 (6 of 7); routes and client together in 1-3; the src siblings
// together in 4-6; directories per commit 3, 3, 3, 2, 2, 1, 2, so the median is 2.
function contentionRepo(t) {
  const fixture = newRepo(t);
  for (let i = 0; i < 3; i += 1) fixture.commit([REGISTRY, ROUTES, CLIENT]);
  fixture.commit([REGISTRY, SIBLING_A, SIBLING_B]);
  fixture.commit([REGISTRY, SIBLING_A, SIBLING_B]);
  fixture.commit([SIBLING_A, SIBLING_B]);
  fixture.commit([REGISTRY, ...MIGRATIONS, LATEST_MIGRATION]);
  fixture.commit([REGISTRY, ...BULK]);
  return fixture;
}

// ---------------------------------------------------------------------------------------------
// Pure functions

test("parseArgs applies the defaults and reads flags and pathspecs", () => {
  assert.deepEqual(parseArgs([]), { maxCommits: 500, top: 20, pathspecs: [] });
  assert.deepEqual(parseArgs(["--top", "5", "--max-commits", "9", "--", "src", "--top"]), {
    maxCommits: 9,
    top: 5,
    pathspecs: ["src", "--top"],
  });
});

test("parseArgs rejects unknown arguments and values that are not positive integers", () => {
  for (const args of [
    ["--bogus"],
    ["src"],
    ["--top"],
    ["--top", "0"],
    ["--top", "-1"],
    ["--max-commits", "1.5"],
    ["--max-commits", "ten"],
  ]) {
    assert.throws(() => parseArgs(args), /unknown argument|positive integer/, args.join(" "));
  }
});

test("parseLog reads hashes and paths, including commits with no files and odd path names", () => {
  const text =
    "\0aaa\0\nREADME.md\0src/with space.js\0" + "\0bbb\0" + "\0ccc\0\n0042\0" + "\0ddd\0\nx\0";
  assert.deepEqual(parseLog(text), [
    { hash: "aaa", files: ["README.md", "src/with space.js"] },
    { hash: "bbb", files: [] },
    { hash: "ccc", files: ["0042"] },
    { hash: "ddd", files: ["x"] },
  ]);
  assert.deepEqual(parseLog(""), []);
});

test("splitBulk ignores commits over 50 files and drops commits with none", () => {
  const commits = [
    { hash: "a", files: Array.from({ length: 50 }, (_, i) => `f${i}`) },
    { hash: "b", files: Array.from({ length: 51 }, (_, i) => `f${i}`) },
    { hash: "c", files: [] },
  ];
  const { scanned, ignored } = splitBulk(commits);
  assert.deepEqual(
    scanned.map((commit) => commit.hash),
    ["a"],
  );
  assert.equal(ignored, 1);
});

test("hotFiles keeps files in two or more commits, ranked by count then path", () => {
  const commits = [{ files: ["b", "a", "once"] }, { files: ["b", "a"] }, { files: ["b"] }];
  assert.deepEqual(hotFiles(commits, 20), [
    { path: "b", commits: 3, share: 1 },
    { path: "a", commits: 2, share: 0.667 },
  ]);
  assert.deepEqual(hotFiles(commits, 1), [{ path: "b", commits: 3, share: 1 }]);
});

test("coupledPairs counts cross-directory pairs changed together three or more times", () => {
  const commits = [
    { files: ["x/one", "y/two", "x/three"] },
    { files: ["x/one", "y/two", "x/three"] },
    { files: ["x/one", "y/two", "x/three"] },
    { files: ["x/one"] },
    { files: ["z/four", "y/two"] },
  ];
  // x/one is in 4 commits, y/two in 4, x/three in 3; x/one and x/three share a directory.
  assert.deepEqual(coupledPairs(commits, 20), [
    { a: "x/three", b: "y/two", coChanges: 3, confidence: 1 },
    { a: "x/one", b: "y/two", coChanges: 3, confidence: 0.75 },
  ]);
});

test("sequences finds directories of three or more digit-led files and keeps the prefix as written", () => {
  const tracked = [
    "db/0001_a.sql",
    "db/0002_b.sql",
    "db/0010_c.sql",
    "db/schema.sql",
    "two/1_a",
    "two/2_b",
    "stamps/20240101_a.rb",
    "stamps/20231231_b.rb",
    "stamps/99999999999999999999_c.rb",
    "stamps/9_d.rb",
  ];
  assert.deepEqual(sequences(tracked, 20), [
    { dir: "stamps", files: 4, highest: "99999999999999999999" },
    { dir: "db", files: 3, highest: "0010" },
  ]);
});

test("medianDirsPerCommit counts distinct parent directories, with the top level as one", () => {
  assert.equal(medianDirsPerCommit([]), 0);
  assert.equal(medianDirsPerCommit([{ files: ["a", "b"] }, { files: ["x/a", "y/b", "c"] }]), 2);
  assert.equal(
    medianDirsPerCommit([{ files: ["a"] }, { files: ["x/a", "y/a"] }, { files: ["x/a"] }]),
    1,
  );
});

// ---------------------------------------------------------------------------------------------
// The script against real repositories

test("contention.mjs reports hot files, coupled pairs, sequences, and scatter for a repository", (t) => {
  const { repo, env } = contentionRepo(t);
  const result = run([], { cwd: repo, env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);

  assert.equal(report.commit, gitIn(repo, env, ["rev-parse", "HEAD"]).trim());
  assert.equal(report.commitsScanned, 7);
  assert.equal(report.commitsIgnored, 1);
  assert.deepEqual(report.hotFiles[0], { path: REGISTRY, commits: 6, share: 0.857 });
  assert.ok(!report.hotFiles.some((file) => file.path.startsWith("vendor/")));
  assert.deepEqual(report.coupledPairs, [
    { a: REGISTRY, b: ROUTES, coChanges: 3, confidence: 1 },
    { a: REGISTRY, b: CLIENT, coChanges: 3, confidence: 1 },
    { a: ROUTES, b: CLIENT, coChanges: 3, confidence: 1 },
  ]);
  assert.ok(!report.coupledPairs.some((pair) => pair.a === SIBLING_A && pair.b === SIBLING_B));
  assert.deepEqual(report.sequences, [{ dir: "db/migrate", files: 3, highest: "0010" }]);
  assert.deepEqual(report.scatter, { medianDirsPerCommit: 2 });
});

test("contention.mjs reads the whole repository from a subdirectory", (t) => {
  const { repo, env } = contentionRepo(t);
  const fromTop = run([], { cwd: repo, env });
  const fromSub = run([], { cwd: join(repo, "src"), env });
  assert.equal(fromSub.status, 0, fromSub.stderr);
  assert.equal(fromSub.stdout, fromTop.stdout);
});

test("contention.mjs limits commits with --max-commits and paths with a pathspec", (t) => {
  const { repo, env } = contentionRepo(t);

  const newest = JSON.parse(run(["--max-commits", "1"], { cwd: repo, env }).stdout);
  assert.equal(newest.commitsScanned, 0);
  assert.equal(newest.commitsIgnored, 1);

  const src = JSON.parse(run(["--", "src"], { cwd: repo, env }).stdout);
  assert.equal(src.commitsScanned, 6);
  assert.deepEqual(
    src.hotFiles.map((file) => file.path),
    [SIBLING_A, ROUTES, SIBLING_B],
  );
  assert.deepEqual(src.sequences, []);
});

test("contention.mjs outside a git repository exits 1 with git's error and the see line", (t) => {
  const dir = tempDir(t);
  const result = run([], { cwd: dir, env: isolatedGitEnv(dir) });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^fatal: not a git repository/);
  assert.match(result.stderr, /\ncontention\.mjs: git .*rev-parse --show-toplevel exited 128\n/);
  assert.equal(lastLine(result.stderr), `see ${DOC}`);
});

test("contention.mjs in a repository with no commits exits 1 naming the missing HEAD", (t) => {
  const { repo, env } = newRepo(t);
  const result = run([], { cwd: repo, env });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    `contention.mjs: HEAD names no commit: the repository has no commits yet\nsee ${DOC}\n`,
  );
});

test("contention.mjs with a bad flag or value exits 2 with the usage line and the see line", (t) => {
  const dir = tempDir(t);
  for (const args of [["--bogus"], ["--top", "0"]]) {
    const result = run(args, { cwd: dir, env: isolatedGitEnv(dir) });
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /\ncontention\.mjs: usage: contention\.mjs \[--max-commits <n>\] \[--top <n>\] \[-- <pathspec>\.\.\.\]\n/,
    );
    assert.equal(lastLine(result.stderr), `see ${DOC}`);
  }
});
