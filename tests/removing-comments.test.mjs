// Fails when check-report.mjs accepts a report line outside the reviewer brief's forms, a path
// outside the scope, a missing, repeated, misplaced, or wrong verdict, or an empty scope, or changes
// its JSON output or exit codes; or when changed-files.sh stops falling back from the PR base to
// origin/HEAD to main, lists a deleted or ignored file, misses a committed, staged, unstaged, or
// untracked one, or changes its exit codes; or when changed-files.sh hides git's or gh's own
// error text: a rev-parse or check-ref-format failure that reaches the agent only as the script's
// own line, or an unauthenticated gh that silently falls back to another base.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/removing-comments/scripts");
const CHECK_REPORT = join(SCRIPTS, "check-report.mjs");
const CHANGED_FILES = join(SCRIPTS, "changed-files.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const GIT = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "removing-comments-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// check-report.mjs

const SCOPE = "lib/cache.rb\nlib/a b.rb\n";
const VALID_REPORT = [
  "- REMOVE lib/cache.rb:20 [comment-only] — narrates what the next line does",
  "- REMOVE lib/cache.rb:14 [root-cause] — FIXME; drop the slash in normalize_key",
  "- KEEP lib/cache.rb:4 — rotation interval set by the pricing API",
  "- ENCODE lib/a b.rb:7 [lint] — suppression; enable the rule for this file",
  "- SKIP lib/a b.rb — generated",
  "REQUEST CHANGES",
  "",
].join("\n");

function checkReport(t, report, { scope = SCOPE, args } = {}) {
  const dir = scratch(t);
  const scopeFile = join(dir, "scope.txt");
  writeFileSync(scopeFile, scope);
  return spawnSync(process.execPath, [CHECK_REPORT, ...(args ?? [scopeFile])], {
    encoding: "utf8",
    input: report,
  });
}

function invalid(t, report, options) {
  const run = checkReport(t, report, options);
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stdout, "");
  const lines = run.stderr.split("\n").filter(Boolean);
  assert.equal(lines.at(-1), `see ${resolve("skills/engineering/removing-comments/SKILL.md")}`);
  return lines.slice(0, -1);
}

test("check-report.mjs prints a valid report's findings and counts as JSON", (t) => {
  const run = checkReport(t, VALID_REPORT);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, "");
  const result = JSON.parse(run.stdout);
  assert.deepEqual(Object.keys(result), [
    "verdict",
    "counts",
    "removeCommentOnly",
    "removeRootCause",
    "keep",
    "encode",
    "skipped",
  ]);
  assert.deepEqual(result, {
    verdict: "REQUEST CHANGES",
    counts: { reviewed: 4, remove: 2, keep: 1, encode: 1, skipped: 1 },
    removeCommentOnly: [
      { file: "lib/cache.rb", line: 20, detail: "narrates what the next line does" },
    ],
    removeRootCause: [
      { file: "lib/cache.rb", line: 14, detail: "FIXME; drop the slash in normalize_key" },
    ],
    keep: [{ file: "lib/cache.rb", line: 4, detail: "rotation interval set by the pricing API" }],
    encode: [
      {
        file: "lib/a b.rb",
        line: 7,
        enforcement: "lint",
        detail: "suppression; enable the rule for this file",
      },
    ],
    skipped: [{ file: "lib/a b.rb", reason: "generated" }],
  });
});

test("check-report.mjs accepts an all-KEEP report with APPROVE, CRLF, and blank lines", (t) => {
  const run = checkReport(t, "\r\n- KEEP lib/cache.rb:4 — contract\r\n\r\nAPPROVE\r\n");
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.verdict, "APPROVE");
  assert.deepEqual(result.counts, { reviewed: 1, remove: 0, keep: 1, encode: 0, skipped: 0 });
});

test("check-report.mjs does not stretch the path over a detail that cites file:line", (t) => {
  const run = checkReport(
    t,
    "- REMOVE lib/cache.rb:3 [comment-only] — repeats lib/x.rb:9 [root-cause] — x\nREQUEST CHANGES\n",
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).removeCommentOnly[0].file, "lib/cache.rb");
});

test("check-report.mjs names each malformed line by number", (t) => {
  const lines = invalid(
    t,
    [
      "Here is my report:",
      "- REMOVE lib/cache.rb [comment-only] — no line",
      "- REMOVE lib/cache.rb:0 [comment-only] — line zero",
      "- REMOVE lib/cache.rb:3 — no tag",
      "- REMOVE lib/cache.rb:3 [obsolete] — unknown tag",
      "- KEEP lib/cache.rb:3 - hyphen instead of the separator",
      "- KEEP lib/cache.rb:3 — ",
      "- ENCODE lib/cache.rb:3 [docs] — unknown enforcement",
      "- ENCODE lib/cache.rb:3 — no enforcement",
      "* KEEP lib/cache.rb:3 — wrong bullet",
      "REQUEST CHANGES",
    ].join("\n"),
  );
  assert.deepEqual(
    lines,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `invalid malformed-line ${n}`),
  );
});

test("check-report.mjs names a finding or SKIP path outside the scope", (t) => {
  const lines = invalid(
    t,
    [
      "- KEEP lib/other.rb:4 — contract",
      "- KEEP ./lib/cache.rb:4 — contract",
      "- SKIP vendor/x.js — vendored",
      "APPROVE",
    ].join("\n"),
  );
  assert.deepEqual(lines, [
    "invalid scope-escape 1 lib/other.rb",
    "invalid scope-escape 2 ./lib/cache.rb",
    "invalid scope-escape 3 vendor/x.js",
  ]);
});

test("check-report.mjs rejects a missing verdict, including on an empty report", (t) => {
  assert.deepEqual(invalid(t, ""), ["invalid missing-verdict"]);
  assert.deepEqual(invalid(t, "- KEEP lib/cache.rb:4 — contract\n"), ["invalid missing-verdict"]);
  assert.deepEqual(invalid(t, "- KEEP lib/cache.rb:4 — contract\nVerdict: APPROVE\n"), [
    "invalid malformed-line 2",
    "invalid missing-verdict",
  ]);
});

test("check-report.mjs rejects a repeated or misplaced verdict", (t) => {
  assert.deepEqual(invalid(t, "APPROVE\nAPPROVE\n"), ["invalid extra-verdict 2"]);
  assert.deepEqual(invalid(t, "APPROVE\n- KEEP lib/cache.rb:4 — contract\n"), [
    "invalid verdict-not-last 1",
  ]);
});

test("check-report.mjs rejects a verdict that disagrees with the findings", (t) => {
  assert.deepEqual(invalid(t, "- REMOVE lib/cache.rb:3 [root-cause] — FIXME\nAPPROVE\n"), [
    "invalid wrong-verdict expected REQUEST CHANGES",
  ]);
  assert.deepEqual(invalid(t, "- ENCODE lib/cache.rb:3 [test] — rule\nAPPROVE\n"), [
    "invalid wrong-verdict expected REQUEST CHANGES",
  ]);
  assert.deepEqual(invalid(t, "- KEEP lib/cache.rb:4 — contract\nREQUEST CHANGES\n"), [
    "invalid wrong-verdict expected APPROVE",
  ]);
});

test("check-report.mjs exits 2 on wrong arguments or an unreadable or empty scope", (t) => {
  for (const args of [[], ["a", "b"]]) {
    const run = checkReport(t, "APPROVE\n", { args });
    assert.equal(run.status, 2, JSON.stringify(args));
    assert.match(run.stderr, /^check-report\.mjs: usage: check-report\.mjs /);
  }
  const missing = checkReport(t, "APPROVE\n", { args: [join(scratch(t), "absent.txt")] });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^check-report\.mjs: cannot read scope file: /);
  const empty = checkReport(t, "APPROVE\n", { scope: "\n\n" });
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /lists no files$/m);
  assert.equal(empty.stdout, "");
});

// changed-files.sh

// A PATH directory whose only entry is a fake `gh` that prints `prBase` as the PR base, or fails
// like `gh pr view` on a branch with no PR, so the host's real gh is never reached.
function fakeGh(dir, prBase) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const body = prBase === undefined ? "exit 1" : `printf '%s\\n' '${prBase}'`;
  writeFileSync(join(bin, "gh"), `#!${BASH}\n${body}\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return bin;
}

// Git with no user or system config, so host settings such as commit signing never apply.
function gitEnv(dir) {
  return {
    HOME: dir,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: dirname(dir),
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
}

function git(repo, ...args) {
  const run = spawnSync(GIT, args, { cwd: repo, encoding: "utf8", env: gitEnv(repo) });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout;
}

// A repository with one commit on `base.txt`, recorded as origin/<branch> for each of `remotes`,
// with HEAD on a feature branch.
function repoWithRemotes(t, remotes) {
  const dir = scratch(t);
  const repo = join(dir, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=feature");
  writeFileSync(join(repo, "base.txt"), "base\n");
  git(repo, "add", "base.txt");
  git(repo, "commit", "--quiet", "-m", "base");
  for (const branch of remotes) git(repo, "update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  return { dir, repo };
}

function changedFiles(dir, cwd, { prBase, args = [] } = {}) {
  const bin = fakeGh(dir, prBase);
  return spawnSync(BASH, [CHANGED_FILES, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...gitEnv(dir), PATH: [bin, dirname(GIT), "/usr/bin", "/bin"].join(delimiter) },
  });
}

function commitFile(repo, name, text = "x\n") {
  writeFileSync(join(repo, name), text);
  git(repo, "add", name);
  git(repo, "commit", "--quiet", "-m", name);
}

test("changed-files.sh uses the PR base that gh reports", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main", "develop"]);
  commitFile(repo, "on-develop.txt");
  git(repo, "update-ref", "refs/remotes/origin/develop", "HEAD");
  commitFile(repo, "feature.txt");
  const run = changedFiles(dir, repo, { prBase: "develop" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "feature.txt\n");
});

test("changed-files.sh falls back to origin/HEAD when gh names no PR base", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main", "trunk"]);
  commitFile(repo, "on-trunk.txt");
  git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");
  git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  commitFile(repo, "feature.txt");
  const run = changedFiles(dir, repo);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "feature.txt\n");
});

test("changed-files.sh falls back to main with no PR base and no origin/HEAD", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main"]);
  commitFile(repo, "feature.txt");
  const run = changedFiles(dir, repo);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "feature.txt\n");
});

test("changed-files.sh lists committed, staged, unstaged, and untracked files without deleted or ignored ones", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main"]);
  writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
  commitFile(repo, "committed.txt");
  commitFile(repo, "committed-then-removed.txt");
  commitFile(repo, "committed-then-git-rm.txt");
  unlinkSync(join(repo, "committed-then-removed.txt"));
  git(repo, "rm", "--quiet", "committed-then-git-rm.txt");
  git(repo, "rm", "--quiet", "base.txt");
  writeFileSync(join(repo, "staged.txt"), "s\n");
  git(repo, "add", "staged.txt", ".gitignore");
  writeFileSync(join(repo, "staged-then-removed.txt"), "s\n");
  git(repo, "add", "staged-then-removed.txt");
  unlinkSync(join(repo, "staged-then-removed.txt"));
  writeFileSync(join(repo, "committed.txt"), "edited\n");
  writeFileSync(join(repo, "ignored.txt"), "i\n");
  writeFileSync(join(repo, "untracked é.txt"), "u\n");
  mkdirSync(join(repo, "sub"));
  const run = changedFiles(dir, join(repo, "sub"));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    [".gitignore", "committed.txt", "staged.txt", "untracked é.txt", ""].join("\n"),
  );
});

test("changed-files.sh prints nothing and exits 0 when nothing changed", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main"]);
  const run = changedFiles(dir, repo);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

test("changed-files.sh exits 1 outside a git work tree", (t) => {
  const dir = scratch(t);
  const run = changedFiles(dir, dir);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^changed-files\.sh: not inside a git work tree$/m);
});

test("changed-files.sh exits 1 on an invalid base name", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main"]);
  const run = changedFiles(dir, repo, { prBase: "bad..name" });
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /^changed-files\.sh: base branch name 'bad\.\.name' is not a valid branch name$/m,
  );
});

test("changed-files.sh exits 1 when origin/<base> is missing", (t) => {
  const { dir, repo } = repoWithRemotes(t, []);
  const run = changedFiles(dir, repo);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^changed-files\.sh: origin\/main does not exist; run 'git fetch /);
});

test("changed-files.sh exits 2 on any argument", (t) => {
  const { dir, repo } = repoWithRemotes(t, ["main"]);
  const run = changedFiles(dir, repo, { args: ["main"] });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^usage: /);
  assert.equal(run.stdout, "");
});

// changed-files.sh error passthrough

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function gitIn(cwd, ...args) {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// A bare remote with `main`, and a clone at <dir>/work on `feature` with one committed
// file, `committed.txt`, and one untracked file, `untracked.txt`.
function cloneRepo(dir) {
  const remote = join(dir, "remote.git");
  mkdirSync(remote);
  gitIn(remote, "init", "-q", "--bare", "-b", "main");
  const work = join(dir, "work");
  gitIn(dir, "clone", "-q", remote, work);
  gitIn(work, "checkout", "-q", "-b", "main");
  writeFileSync(join(work, "base.txt"), "base\n");
  gitIn(work, "add", "base.txt");
  gitIn(work, "commit", "-q", "-m", "base");
  gitIn(work, "push", "-q", "origin", "main");
  gitIn(work, "checkout", "-q", "-b", "feature");
  writeFileSync(join(work, "committed.txt"), "committed\n");
  gitIn(work, "add", "committed.txt");
  gitIn(work, "commit", "-q", "-m", "feature");
  writeFileSync(join(work, "untracked.txt"), "untracked\n");
  return work;
}

// A fake `gh` that writes `out` to stdout and `err` to stderr, then exits `code`.
function fakeGhWith(dir, { out = "", err = "", code = 0 }) {
  const bin = join(dir, "gh-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "gh"),
    `#!${process.execPath}
process.stdout.write(${JSON.stringify(out)});
process.stderr.write(${JSON.stringify(err)});
process.exit(${code});
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  return bin;
}

// A `git` first on PATH that runs the real git, except for one subcommand prefix, which
// writes `sentinel` to stderr and exits 128, as git does for dubious ownership.
function gitShim(dir, failing, sentinel) {
  const bin = join(dir, "git-shim");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "git"),
    `#!${BASH}
if [ "\${*:1:${failing.length}}" = ${JSON.stringify(failing.join(" "))} ]; then
  printf '%s\\n' ${JSON.stringify(sentinel)} >&2
  exit 128
fi
exec ${JSON.stringify(GIT)} "$@"
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  return bin;
}

function runChangedFiles(cwd, pathDirs) {
  return spawnSync(BASH, [CHANGED_FILES], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, PATH: [...pathDirs, process.env.PATH].join(":") },
  });
}

function lineIndex(text, line) {
  return text.split("\n").indexOf(line);
}

test("changed-files.sh passes git's and gh's own error text through", async (t) => {
  await t.test("shows git's rev-parse error before not inside a git work tree", (st) => {
    const dir = scratch(st);
    const work = cloneRepo(dir);
    const shim = gitShim(
      dir,
      ["rev-parse", "--show-toplevel"],
      "fatal: git-toplevel-sentinel: detected dubious ownership",
    );
    const gh = fakeGhWith(dir, { out: "main\n" });
    const result = runChangedFiles(work, [shim, gh]);
    assert.equal(result.status, 1, result.stderr);
    const tool = lineIndex(
      result.stderr,
      "fatal: git-toplevel-sentinel: detected dubious ownership",
    );
    const own = lineIndex(result.stderr, "changed-files.sh: not inside a git work tree");
    assert.notEqual(tool, -1, `git's line is missing from stderr:\n${result.stderr}`);
    assert.ok(tool < own, `git's line is not before the script's line:\n${result.stderr}`);
    assert.equal(result.stdout, "");
  });

  await t.test("shows git's check-ref-format error before the base-name failure", (st) => {
    const dir = scratch(st);
    const work = cloneRepo(dir);
    const shim = gitShim(dir, ["check-ref-format"], "fatal: git-ref-format-sentinel");
    const gh = fakeGhWith(dir, { out: "main\n" });
    const result = runChangedFiles(work, [shim, gh]);
    assert.equal(result.status, 1, result.stderr);
    const tool = lineIndex(result.stderr, "fatal: git-ref-format-sentinel");
    const own = lineIndex(
      result.stderr,
      "changed-files.sh: base branch name 'main' is not a valid branch name",
    );
    assert.notEqual(tool, -1, `git's line is missing from stderr:\n${result.stderr}`);
    assert.ok(tool < own, `git's line is not before the script's line:\n${result.stderr}`);
    assert.equal(result.stdout, "");
  });

  await t.test("shows gh's error and still lists the files against the fallback base", (st) => {
    const dir = scratch(st);
    const work = cloneRepo(dir);
    const gh = fakeGhWith(dir, {
      err: "gh-auth-sentinel: To get started with GitHub CLI, please run: gh auth login\n",
      code: 1,
    });
    const result = runChangedFiles(work, [gh]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /^gh-auth-sentinel: To get started with GitHub CLI, please run: gh auth login$/m,
    );
    assert.equal(result.stdout, "committed.txt\nuntracked.txt\n");
  });
});

test("changed-files.sh drops gh's no-PR message and lists the files against the fallback base", (t) => {
  const dir = scratch(t);
  const work = cloneRepo(dir);
  const gh = fakeGhWith(dir, { err: 'no pull requests found for branch "feature"\n', code: 1 });
  const result = runChangedFiles(work, [gh]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /no pull requests found/);
  assert.equal(result.stdout, "committed.txt\nuntracked.txt\n");
});

test("changed-files.sh keeps gh's stderr out of the base when gh succeeds", (t) => {
  const dir = scratch(t);
  const work = cloneRepo(dir);
  const gh = fakeGhWith(dir, { out: "main\n", err: "gh-debug-sentinel: GET /graphql 200\n" });
  const result = runChangedFiles(work, [gh]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /^gh-debug-sentinel: GET \/graphql 200$/m);
  assert.equal(result.stdout, "committed.txt\nuntracked.txt\n");
});

test("changed-files.sh names its own SKILL.md when run by a relative path below the top level", (t) => {
  const dir = scratch(t);
  const work = cloneRepo(dir);
  const sub = join(work, "sub");
  mkdirSync(sub);
  symlinkSync(dirname(dirname(CHANGED_FILES)), join(sub, "tool"));
  const gh = fakeGhWith(dir, { out: "absent\n" });
  const result = spawnSync(BASH, ["tool/scripts/changed-files.sh"], {
    cwd: sub,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, PATH: [gh, process.env.PATH].join(":") },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(
    result.stderr.replace(/\n$/, "").split("\n").at(-1),
    `see ${realpathSync(resolve("skills/engineering/removing-comments/SKILL.md"))}`,
  );
});
