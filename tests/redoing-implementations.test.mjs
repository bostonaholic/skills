// Fails when save-and-reset-attempt.sh stops saving an attempt's committed part,
// uncommitted tracked changes (binary ones included), or untracked files; resets
// anything before both saves pass their checks; touches files outside the list;
// prints restore lines that do not bring the attempt back; or stops exiting 2 on a
// usage error, 3 on a missing tool, or 1 on a failed save check.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve(
  "skills/engineering/redoing-implementations/scripts/save-and-reset-attempt.sh",
);
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Isolate every fixture repository from the host's git configuration.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "redoing-implementations-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(repo, ...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(repo, file, content) {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), content);
}

function read(repo, file) {
  return existsSync(join(repo, file)) ? readFileSync(join(repo, file)) : null;
}

// A repository at `dir/repo` with no commits.
function newRepo(dir) {
  const repo = join(dir, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  return repo;
}

function commit(repo, message) {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "--no-verify", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function run(repo, args, { cwd = repo, env = {} } = {}) {
  return spawnSync(BASH, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...GIT_ENV, ...env },
  });
}

function parse(stdout) {
  const fields = {};
  const restore = [];
  for (const line of stdout.trim().split("\n")) {
    const at = line.indexOf("=");
    const [key, value] = [line.slice(0, at), line.slice(at + 1)];
    if (key === "restore") restore.push(value);
    else fields[key] = value;
  }
  return { fields, restore };
}

function snapshot(repo, files) {
  return {
    status: git(repo, "status", "--porcelain", "--untracked-files=all"),
    contents: Object.fromEntries(files.map((f) => [f, read(repo, f)?.toString("base64")])),
  };
}

function runRestore(repo, restore) {
  for (const command of restore) {
    const result = spawnSync(BASH, ["-c", command], { cwd: repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }
}

test("on a branch with no commits it resets to the empty tree and restores the attempt", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "lib/staged.rb", "staged\n");
  git(repo, "add", "lib/staged.rb");
  write(repo, "lib/new file.rb", "untracked\n");
  write(repo, "other.txt", "not the attempt's\n");
  const files = ["lib/staged.rb", "lib/new file.rb", "other.txt"];
  const before = snapshot(repo, files);
  const out = join(dir, "out");

  const result = run(repo, ["HEAD", "importer", out, "--", "lib/staged.rb", "lib/new file.rb"]);

  assert.equal(result.status, 0, result.stderr);
  const { fields, restore } = parse(result.stdout);
  assert.deepEqual(fields, {
    base: git(repo, "hash-object", "-t", "tree", "/dev/null"),
    branch: "none",
    patch: join(out, "previous-attempt.patch"),
    tar: join(out, "untracked.tar"),
    tracked: "1",
    untracked: "1",
  });
  assert.equal(restore.length, 2);
  assert.equal(read(repo, "lib/staged.rb"), null);
  assert.equal(read(repo, "lib/new file.rb"), null);
  assert.equal(git(repo, "status", "--porcelain", "--untracked-files=all"), "?? other.txt");

  runRestore(repo, restore);
  assert.deepEqual(snapshot(repo, files).contents, before.contents);
});

test("with commits it branches the committed part, resets to BASE, and restores the attempt", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "a.rb", "base a\n");
  write(repo, "gone.rb", "base gone\n");
  write(repo, "unrelated.rb", "base unrelated\n");
  const base = commit(repo, "base");
  write(repo, "a.rb", "committed a\n");
  write(repo, "lib/b.rb", "committed b\n");
  const head = commit(repo, "attempt");
  write(repo, "a.rb", "uncommitted a\n");
  write(repo, "c.rb", "staged c\n");
  git(repo, "add", "c.rb");
  git(repo, "rm", "-q", "gone.rb");
  write(repo, "d.rb", "untracked d\n");
  write(repo, "unrelated.rb", "other work\n");
  const files = ["a.rb", "lib/b.rb", "c.rb", "d.rb", "gone.rb"];
  const before = snapshot(repo, [...files, "unrelated.rb"]);
  const out = join(dir, "out");

  const result = run(repo, [base, "importer", out, "--", ...files]);

  assert.equal(result.status, 0, result.stderr);
  const { fields, restore } = parse(result.stdout);
  assert.equal(fields.base, base);
  assert.equal(fields.branch, "redo-previous-importer");
  assert.equal(fields.tracked, "4");
  assert.equal(fields.untracked, "1");
  assert.equal(git(repo, "rev-parse", "redo-previous-importer"), head);
  assert.equal(read(repo, "a.rb").toString(), "base a\n");
  assert.equal(read(repo, "gone.rb").toString(), "base gone\n");
  for (const file of ["lib/b.rb", "c.rb", "d.rb"]) assert.equal(read(repo, file), null, file);
  assert.equal(read(repo, "unrelated.rb").toString(), "other work\n");
  assert.equal(git(repo, "diff", "--cached", base, "--name-only"), "");

  runRestore(repo, restore);
  assert.deepEqual(snapshot(repo, [...files, "unrelated.rb"]).contents, before.contents);
});

test("it saves and restores a binary change despite diff.noprefix", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  git(repo, "config", "diff.noprefix", "true");
  write(repo, "logo.bin", Buffer.from([0, 1, 2, 255, 0, 3]));
  commit(repo, "base");
  write(repo, "logo.bin", Buffer.from([0, 9, 8, 255, 0, 7, 0]));
  const before = snapshot(repo, ["logo.bin"]);

  const result = run(repo, ["HEAD", "logo", join(dir, "out"), "--", "logo.bin"]);

  assert.equal(result.status, 0, result.stderr);
  const { fields, restore } = parse(result.stdout);
  assert.equal(fields.branch, "none");
  assert.equal(fields.tar, "none");
  assert.deepEqual(read(repo, "logo.bin"), Buffer.from([0, 1, 2, 255, 0, 3]));
  runRestore(repo, restore);
  assert.deepEqual(snapshot(repo, ["logo.bin"]), before);
});

test("it prints none for a save with nothing to hold", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "a.rb", "base\n");
  commit(repo, "base");
  write(repo, "new.rb", "untracked\n");

  const result = run(repo, ["HEAD", "x", join(dir, "out"), "--", "new.rb"]);

  assert.equal(result.status, 0, result.stderr);
  const { fields, restore } = parse(result.stdout);
  assert.equal(fields.patch, "none");
  assert.equal(fields.tracked, "0");
  assert.deepEqual(restore, [`tar -xf ${join(dir, "out", "untracked.tar")}`]);
});

test("a rerun accepts a branch already at HEAD", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "a.rb", "base\n");
  const base = commit(repo, "base");
  write(repo, "a.rb", "attempt\n");
  commit(repo, "attempt");
  git(repo, "branch", "redo-previous-x");

  const result = run(repo, [base, "x", join(dir, "out"), "--", "a.rb"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(repo, "a.rb").toString(), "base\n");
});

// A PATH directory holding the host's tools plus `overrides`, each a fake script body.
function fakeBin(dir, overrides) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const hostPath = process.env.PATH.split(":");
  for (const tool of ["git", "tar", "ls", "mkdir", "rm", "sort"]) {
    const real = hostPath.map((p) => join(p, tool)).find((p) => existsSync(p));
    assert.ok(real, `test host lacks ${tool}`);
    const target = join(bin, tool);
    if (overrides[tool] === undefined) symlinkSync(real, target);
    else if (overrides[tool] !== null) {
      writeFileSync(target, `#!${BASH}\nREAL=${real}\n${overrides[tool]}\n`);
      chmodSync(target, 0o755);
    }
  }
  return bin;
}

function attemptWithBoth(dir) {
  const repo = newRepo(dir);
  write(repo, "a.rb", "base\n");
  commit(repo, "base");
  write(repo, "a.rb", "attempt\n");
  write(repo, "new.rb", "untracked\n");
  return repo;
}

for (const [name, overrides] of [
  ["the patch check", { git: 'if [[ $1 == apply ]]; then exit 1; fi\nexec "$REAL" "$@"' }],
  [
    "the tar listing",
    { tar: 'if [[ $1 == -tf ]]; then echo other.rb; exit 0; fi\nexec "$REAL" "$@"' },
  ],
]) {
  test(`it exits 1 and resets nothing when ${name} fails`, (t) => {
    const dir = scratch(t);
    const repo = attemptWithBoth(dir);
    const before = snapshot(repo, ["a.rb", "new.rb"]);

    const result = run(repo, ["HEAD", "x", join(dir, "out"), "--", "a.rb", "new.rb"], {
      env: { PATH: fakeBin(dir, overrides) },
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /^error: /m);
    assert.equal(result.stdout, "");
    assert.deepEqual(snapshot(repo, ["a.rb", "new.rb"]), before);
  });
}

for (const tool of ["git", "tar"]) {
  test(`it exits 3 when ${tool} is missing`, (t) => {
    const dir = scratch(t);
    const repo = attemptWithBoth(dir);
    const result = run(repo, ["HEAD", "x", join(dir, "out"), "--", "a.rb"], {
      env: { PATH: fakeBin(dir, { [tool]: null }) },
    });
    assert.equal(result.status, 3);
    assert.match(result.stderr, new RegExp(`missing required tool: ${tool}`));
  });
}

test("it exits 2 on each usage error and changes nothing", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "a.rb", "base\n");
  const base = commit(repo, "base");
  git(repo, "checkout", "-q", "-b", "side");
  write(repo, "side.rb", "side\n");
  const side = commit(repo, "side");
  git(repo, "checkout", "-q", "main");
  git(repo, "branch", "redo-previous-taken", side);
  write(repo, "a.rb", "attempt\n");
  write(repo, "new.rb", "untracked\n");
  write(repo, "lib/one.rb", "untracked\n");
  const full = join(dir, "full");
  mkdirSync(full);
  writeFileSync(join(full, "keep"), "");
  const notRepo = join(dir, "plain");
  mkdirSync(notRepo);
  const out = join(dir, "out");
  const files = ["a.rb", "new.rb", "lib/one.rb", "side.rb"];
  const before = snapshot(repo, files);

  const cases = [
    ["too few arguments", ["HEAD", "x", out, "--"]],
    ["no -- separator", ["HEAD", "x", out, "a.rb", "new.rb"]],
    ["BASE not a commit", ["nope", "x", out, "--", "a.rb"]],
    ["BASE not an ancestor", [side, "x", out, "--", "a.rb"]],
    ["OUT inside the working tree", ["HEAD", "x", join(repo, "saves"), "--", "a.rb"]],
    ["OUT not empty", ["HEAD", "x", full, "--", "a.rb"]],
    ["a directory", ["HEAD", "x", out, "--", "lib"]],
    ["an unknown file", ["HEAD", "x", out, "--", "missing.rb"]],
  ];
  for (const [label, args] of cases) {
    const result = run(repo, args);
    assert.equal(result.status, 2, `${label}: ${result.stderr}`);
    assert.equal(result.stdout, "", label);
    assert.deepEqual(snapshot(repo, files), before, label);
  }
  assert.equal(existsSync(join(repo, "saves")), false);

  // A committed part whose branch name is invalid or already points elsewhere.
  commit(repo, "attempt");
  const badName = run(repo, [base, "bad..name", out, "--", "a.rb"]);
  assert.equal(badName.status, 2, badName.stderr);
  assert.match(badName.stderr, /not a valid branch name/);
  const taken = run(repo, [base, "taken", out, "--", "a.rb"]);
  assert.equal(taken.status, 2, taken.stderr);
  assert.match(taken.stderr, /redo-previous-taken exists/);

  assert.equal(run(repo, ["HEAD", "x", out, "--", "one.rb"], { cwd: join(repo, "lib") }).status, 2);
  assert.equal(run(notRepo, ["HEAD", "x", out, "--", "a.rb"]).status, 2);
  assert.equal(existsSync(out) && readdirSync(out).length > 0, false);
});

test("on a branch with no commits BASE must be HEAD", (t) => {
  const dir = scratch(t);
  const repo = newRepo(dir);
  write(repo, "a.rb", "new\n");
  const result = run(repo, ["main", "x", join(dir, "out"), "--", "a.rb"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BASE must be HEAD/);
  assert.equal(read(repo, "a.rb").toString(), "new\n");
});
