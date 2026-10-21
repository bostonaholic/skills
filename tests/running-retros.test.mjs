// Fails when running-retros' apply and gather scripts stop holding their
// contracts: check-edit-target.sh must apply an edit only to a tracked, clean
// file at its pre-image and a creation only at a free path; file-issue.sh must
// refuse a repo.txt that is not owner/name, pass every value to gh by file or
// argument, and count a failed or URL-less create as unfiled; list-sessions.mjs
// must list only this repository's sessions, newest first, without the current
// one, and fail by name on an unknown host or an OpenCode store.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  declaredCwd,
  newestFirst,
} from "../skills/productivity/running-retros/scripts/list-sessions.mjs";

const SCRIPTS = resolve("skills/productivity/running-retros/scripts");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "running-retros-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// A repository with one committed file, `tracked.md`.
function repo(t) {
  const dir = join(scratch(t), "repo");
  mkdirSync(dir);
  git(dir, "init", "-q");
  writeFileSync(join(dir, "tracked.md"), "one\n");
  git(dir, "add", "tracked.md");
  git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "init",
  );
  return dir;
}

// ---------------------------------------------------------------------------
// check-edit-target.sh
// ---------------------------------------------------------------------------

function check(...args) {
  return spawnSync(BASH, [join(SCRIPTS, "check-edit-target.sh"), ...args], { encoding: "utf8" });
}

test("check-edit-target.sh applies an edit to a tracked, clean file at its pre-image", (t) => {
  const dir = repo(t);
  const blob = git(dir, "hash-object", "--", "tracked.md");
  for (const path of ["tracked.md", join(dir, "tracked.md")]) {
    const result = check(dir, path, blob);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "apply\n");
  }
});

test("check-edit-target.sh skips an untracked edit target", (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, "new.md"), "x\n");
  const blob = git(dir, "hash-object", "--", "new.md");
  const result = check(dir, "new.md", blob);
  assert.equal(result.status, 3);
  assert.equal(result.stdout, "skip: untracked\n");
});

test("check-edit-target.sh skips a dirty edit target", (t) => {
  const dir = repo(t);
  const blob = git(dir, "hash-object", "--", "tracked.md");
  writeFileSync(join(dir, "tracked.md"), "two\n");
  const result = check(dir, "tracked.md", blob);
  assert.equal(result.status, 3);
  assert.equal(result.stdout, "skip: dirty\n");
});

test("check-edit-target.sh skips an edit target whose blob left the pre-image", (t) => {
  const dir = repo(t);
  const result = check(dir, "tracked.md", "0".repeat(40));
  assert.equal(result.status, 3);
  assert.equal(result.stdout, "skip: changed\n");
});

test("check-edit-target.sh applies a creation at a free path and skips a taken one", (t) => {
  const dir = repo(t);
  assert.equal(check(dir, "docs/new.md", "absent").stdout, "apply\n");
  const taken = check(dir, "tracked.md", "absent");
  assert.equal(taken.status, 3);
  assert.equal(taken.stdout, "skip: exists\n");
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling"));
  assert.equal(check(dir, "dangling", "absent").stdout, "skip: exists\n");
});

test("check-edit-target.sh exits 1 on a usage error or a malformed pre-image", (t) => {
  const dir = repo(t);
  for (const args of [[], [dir, "tracked.md"], [dir, "", "absent"], [dir, "a", "b", "c"]]) {
    const result = check(...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /^usage: check-edit-target\.sh /);
  }
  const bad = check(dir, "tracked.md", "not-a-blob");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^error: pre-image must be a blob id or 'absent'/);
});

test("check-edit-target.sh exits 1 outside a git repository", (t) => {
  const dir = scratch(t);
  const result = check(dir, "x.md", "0".repeat(40));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^fatal: not a git repository.*\nerror: not a git repository: /);
  const missing = check(join(dir, "absent"), "x.md", "absent");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^error: repo root is not a directory: /);
});

test("check-edit-target.sh names its doc after changing directory on a relative call", (t) => {
  const dir = scratch(t);
  const result = spawnSync(BASH, ["check-edit-target.sh", dir, "x.md", "0".repeat(40)], {
    cwd: SCRIPTS,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  const doc = realpathSync(join(SCRIPTS, "..", "references", "applying-edits.md"));
  assert.equal(result.stderr.trimEnd().split("\n").at(-1), `see ${doc}`);
});

// ---------------------------------------------------------------------------
// file-issue.sh
// ---------------------------------------------------------------------------

// A PATH directory with `grep` and `tail` from the host, and a fake `gh` that
// logs each argument on its own line and then runs `body`.
function fakeGh(dir, body) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of ["grep", "tail"]) {
    const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    symlinkSync(found, join(bin, tool));
  }
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  writeFileSync(join(bin, "gh"), `#!${BASH}\nprintf '%s\\n' "$@" >>'${log}'\n${body}\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return { bin, log };
}

function runCache(dir, { repo = "acme/api\n", title = "Split refactors\n", body = "Body\n" } = {}) {
  const cache = join(dir, "cache");
  mkdirSync(cache);
  if (repo !== null) writeFileSync(join(cache, "repo.txt"), repo);
  if (title !== null) writeFileSync(join(cache, "title-1.txt"), title);
  if (body !== null) writeFileSync(join(cache, "issue-1.md"), body);
  return cache;
}

function fileIssue(t, { gh = "echo https://github.com/acme/api/issues/7", files, args } = {}) {
  const dir = scratch(t);
  const { bin, log } = fakeGh(dir, gh);
  const cache = runCache(dir, files);
  const result = spawnSync(BASH, [join(SCRIPTS, "file-issue.sh"), ...(args ?? [cache, "1"])], {
    encoding: "utf8",
    env: { PATH: bin },
  });
  return { result, cache, ghArgs: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("file-issue.sh files the issue from the run cache and prints its URL", (t) => {
  const { result, cache, ghArgs } = fileIssue(t, {
    files: { title: "Title with $(id) and `ls`\n" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "url: https://github.com/acme/api/issues/7\n");
  assert.deepEqual(ghArgs, [
    "issue",
    "create",
    "--repo",
    "acme/api",
    "--title",
    "Title with $(id) and `ls`",
    "--body-file",
    join(cache, "issue-1.md"),
  ]);
});

test("file-issue.sh exits 2 and calls no gh for a repo.txt that is not owner/name", (t) => {
  for (const repo of [
    "acme",
    "acme/api/x",
    "/acme/api",
    "acme/",
    ".acme/api",
    "-acme/api",
    "acme/.",
    "acme/..",
    "acme/a b",
    "acme/$(id)",
    "acme/api\nother/x",
  ]) {
    const { result, ghArgs } = fileIssue(t, { files: { repo } });
    assert.equal(result.status, 2, JSON.stringify(repo));
    assert.match(result.stderr, /^refusing: the repository must be owner\/name$/m);
    assert.deepEqual(ghArgs, [], JSON.stringify(repo));
  }
});

test("file-issue.sh accepts dots, underscores, and dashes inside owner/name", (t) => {
  const { result, ghArgs } = fileIssue(t, { files: { repo: "my-org/.github_x.y" } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(ghArgs[3], "my-org/.github_x.y");
});

test("file-issue.sh exits 3 when gh fails or prints no issue URL", (t) => {
  for (const gh of ["echo 'HTTP 410: issues disabled' >&2; exit 1", "echo 'created'"]) {
    const { result } = fileIssue(t, { gh });
    assert.equal(result.status, 3, gh);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: gh issue create (failed|printed no issue URL)$/m);
  }
});

test("file-issue.sh exits 1 on a missing or empty input file, before any gh call", (t) => {
  for (const files of [{ repo: null }, { title: null }, { body: "" }, { title: "\n\n" }]) {
    const { result, ghArgs } = fileIssue(t, { files });
    assert.equal(result.status, 1, JSON.stringify(files));
    assert.match(result.stderr, /^error: /);
    assert.deepEqual(ghArgs, []);
  }
});

test("file-issue.sh exits 1 on a usage error", (t) => {
  for (const args of [[], ["cache"], ["cache", "0"], ["cache", "1a"], ["cache", "../1"]]) {
    const { result, ghArgs } = fileIssue(t, { args });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /^usage: file-issue\.sh /);
    assert.deepEqual(ghArgs, []);
  }
});

test("file-issue.sh exits 1 when gh is missing", (t) => {
  const dir = scratch(t);
  const cache = runCache(dir);
  const result = spawnSync(BASH, [join(SCRIPTS, "file-issue.sh"), cache, "1"], {
    encoding: "utf8",
    env: { PATH: join(dir, "empty") },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^error: missing required tool: gh$/m);
});

// ---------------------------------------------------------------------------
// list-sessions.mjs
// ---------------------------------------------------------------------------

function listSessions(env, ...args) {
  return spawnSync(process.execPath, [join(SCRIPTS, "list-sessions.mjs"), ...args], {
    encoding: "utf8",
    env,
  });
}

function writeAt(path, text, seconds) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, text);
  utimesSync(path, seconds, seconds);
}

const CURRENT = "11111111-aaaa-bbbb-cccc-000000000000";
const OLD = "22222222-aaaa-bbbb-cccc-000000000000";
const NEW = "33333333-aaaa-bbbb-cccc-000000000000";

test("list-sessions.mjs lists Claude Code sessions for the repo, newest first, without this one", (t) => {
  const dir = scratch(t);
  const repoRoot = join(dir, "code", "my.repo");
  mkdirSync(repoRoot, { recursive: true });
  const project = join(dir, "claude", "projects", repoRoot.replace(/[/.]/g, "-"));
  writeAt(join(project, `${OLD}.jsonl`), "{}\n", 1000);
  writeAt(join(project, `${NEW}.jsonl`), "{}\n", 3000);
  writeAt(join(project, `${CURRENT}.jsonl`), "{}\n", 4000);
  writeAt(join(project, OLD, "subagents", "agent-1.jsonl"), "{}\n", 5000);
  writeAt(join(dir, "claude", "projects", "-other", `${NEW}.jsonl`), "{}\n", 6000);
  const env = { CLAUDE_CONFIG_DIR: join(dir, "claude"), CLAUDE_CODE_SESSION_ID: CURRENT };

  const result = listSessions(env, repoRoot, "10");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "host: claude-code",
      `store: ${join(dir, "claude", "projects")}`,
      "found: 2",
      `session: ${join(project, `${NEW}.jsonl`)}`,
      `session: ${join(project, `${OLD}.jsonl`)}`,
      "",
    ].join("\n"),
  );

  const capped = listSessions(env, repoRoot, "1");
  assert.match(capped.stdout, /^found: 2$/m);
  assert.equal(capped.stdout.match(/^session: /gm).length, 1);
});

test("list-sessions.mjs matches Codex rollouts by recorded cwd and drops this thread", (t) => {
  const dir = scratch(t);
  const repoRoot = join(dir, "repo");
  mkdirSync(repoRoot);
  const day = join(dir, "codex", "sessions", "2026", "10", "21");
  const meta = (cwd) => `${JSON.stringify({ type: "session_meta", payload: { id: "x", cwd } })}\n`;
  writeAt(join(day, `rollout-a-${OLD}.jsonl`), meta(repoRoot), 1000);
  writeAt(join(day, `rollout-b-${NEW}.jsonl`), meta(join(repoRoot, "pkg")), 2000);
  writeAt(join(day, `rollout-c-${CURRENT}.jsonl`), meta(repoRoot), 3000);
  writeAt(join(day, "rollout-d-44444444.jsonl"), meta(`${repoRoot}-sibling`), 4000);
  writeAt(join(day, "rollout-e-55555555.jsonl"), "not json\n", 5000);
  const env = { CODEX_HOME: join(dir, "codex"), CODEX_THREAD_ID: CURRENT };

  const result = listSessions(env, repoRoot, "5");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^host: codex$/m);
  assert.match(result.stdout, /^found: 2$/m);
  assert.deepEqual(result.stdout.match(/^session: .*$/gm), [
    `session: ${join(day, `rollout-b-${NEW}.jsonl`)}`,
    `session: ${join(day, `rollout-a-${OLD}.jsonl`)}`,
  ]);
});

test("list-sessions.mjs prints found: 0 for a repo with no sessions", (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, "claude", "projects"), { recursive: true });
  const env = { CLAUDE_CONFIG_DIR: join(dir, "claude"), CLAUDE_CODE_SESSION_ID: CURRENT };
  const result = listSessions(env, dir, "3");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^found: 0$/m);
  assert.doesNotMatch(result.stdout, /^session: /m);
});

test("list-sessions.mjs fails by name on an unknown, ambiguous, or OpenCode host", (t) => {
  const dir = scratch(t);
  const cases = [
    [{}, "unsupported-host"],
    [{ CLAUDE_CODE_SESSION_ID: CURRENT, CODEX_THREAD_ID: OLD }, "ambiguous-host"],
    [{ OPENCODE: "1", XDG_DATA_HOME: dir }, "unsupported-store"],
    [{ CLAUDECODE: "1", CLAUDE_CONFIG_DIR: dir }, "no-session-id"],
    [{ CLAUDE_CODE_SESSION_ID: CURRENT, CLAUDE_CONFIG_DIR: join(dir, "x") }, "no-session-store"],
  ];
  for (const [env, failure] of cases) {
    const result = listSessions({ HOME: dir, ...env }, dir, "3");
    assert.equal(result.status, 1, failure);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.split("\n")[0], failure);
    assert.match(result.stderr, /^ {2}tried: /m, failure);
    assert.match(result.stderr, /^ {2}note: /m, failure);
  }
});

test("list-sessions.mjs exits 1 on a usage error or a missing repo root", (t) => {
  const dir = scratch(t);
  const env = { CLAUDE_CODE_SESSION_ID: CURRENT, CLAUDE_CONFIG_DIR: dir };
  for (const args of [[], [dir], [dir, "0"], [dir, "-1"], [dir, "two"], [dir, "1", "x"]]) {
    const result = listSessions(env, ...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /^usage: list-sessions\.mjs /);
  }
  const missing = listSessions(env, join(dir, "absent"), "1");
  assert.equal(missing.status, 1);
  assert.equal(missing.stderr.split("\n")[0], "no-repo-root");
});

test("newestFirst orders by modification time, breaks ties by path, and drops this session", () => {
  const mtimes = { "/s/b.jsonl": 5, "/s/a.jsonl": 5, "/s/c.jsonl": 9, [`/s/${CURRENT}.jsonl`]: 10 };
  assert.deepEqual(
    newestFirst({
      host: "claude-code",
      files: Object.keys(mtimes),
      currentSessionId: CURRENT,
      mtimeOf: (file) => mtimes[file],
    }),
    ["/s/c.jsonl", "/s/a.jsonl", "/s/b.jsonl"],
  );
});

test("declaredCwd reads session_meta and ignores other or truncated lines", () => {
  const meta = JSON.stringify({ type: "session_meta", payload: { cwd: "/r" } });
  assert.equal(declaredCwd(`{"type":"x"}\n${meta}\n{"trunc`), "/r");
  assert.equal(declaredCwd('{"type":"session_meta","payload":{}}\n'), null);
  assert.equal(declaredCwd(""), null);
});
