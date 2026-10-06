// Fails when the attaching-pr-screenshots scripts stop resolving the current
// branch's PR with no PR token, stop refusing a bad entries file before any `gh`
// call, stop treating a missing tool as a fault, stop exiting 3 when `gh pr edit`
// cannot attach, or print a refusal prefix other than `refused:`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/attaching-pr-screenshots/scripts");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command upload.sh runs besides `gh` and `file`.
const UPLOAD_TOOLS = ["jq", "cat", "wc", "tr", "rm", "dirname", "basename", "grep"];

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "attaching-pr-screenshots-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

// A PATH directory holding `tools` linked from the host and a fake `gh` that
// logs each call's arguments and answers from the `cases` script fragment.
function fakeBin(dir, { tools = [], cases = "" } = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const gh = join(bin, "gh");
  writeFileSync(gh, `#!${BASH}\nprintf '%s\\n' "$*" >>'${log}'\ncase "$*" in\n${cases}\n  *) exit 1 ;;\nesac\n`);
  chmodSync(gh, 0o755);
  return { bin, log };
}

function run(script, args, bin) {
  return spawnSync(BASH, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: { PATH: bin } });
}

test("resolve-pr.sh resolves the current branch's PR when the invocation has no PR token", (t) => {
  const dir = scratch(t);
  const runDir = join(dir, "run");
  mkdirSync(runDir);
  const { bin, log } = fakeBin(dir, {
    cases: `  "pr view --json url --jq .url") echo https://ghe.example.com/org/repo/pull/12 ;;`,
  });
  const result = run("resolve-pr.sh", ["--entries /tmp/entries.json", runDir], bin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(log, "utf8"), "pr view --json url --jq .url\n");
  const read = (name) => readFileSync(join(runDir, name), "utf8").trim();
  assert.equal(read("pr-host"), "ghe.example.com");
  assert.equal(read("repo-spec"), "ghe.example.com/org/repo");
  assert.equal(read("number"), "12");
  assert.equal(read("entries-file"), "/tmp/entries.json");
});

test("resolve-pr.sh refuses with exit 1 when the current branch has no PR", (t) => {
  const dir = scratch(t);
  const { bin } = fakeBin(dir);
  const result = run("resolve-pr.sh", ["", dir], bin);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no PR for the current branch/);
});

test("resolve-pr.sh exits 2 when gh is missing", (t) => {
  const dir = scratch(t);
  const result = run("resolve-pr.sh", ["42", dir], join(dir, "empty"));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing required tool: gh/);
});

function uploadRun(t, entries, { tools = [...UPLOAD_TOOLS, "file"], cases = "" } = {}) {
  const dir = scratch(t);
  const runDir = join(dir, "run");
  const root = join(dir, "shots");
  mkdirSync(runDir);
  mkdirSync(root);
  const entriesFile = join(dir, "entries.json");
  writeFileSync(entriesFile, typeof entries === "string" ? entries : JSON.stringify({ root, ...entries }));
  for (const [name, value] of Object.entries({ "pr-host": "github.com", number: "7", "repo-spec": "github.com/o/r", "entries-file": entriesFile })) {
    writeFileSync(join(runDir, name), `${value}\n`);
  }
  writeFileSync(join(runDir, "pre-image.md"), "Body.\n");
  const { bin, log } = fakeBin(dir, { tools, cases });
  const result = run("upload.sh", [runDir], bin);
  return { result, ghCalls: readFileSync(log, "utf8"), root, runDir };
}

test("upload.sh refuses zero entries before any gh call", (t) => {
  const { result, ghCalls } = uploadRun(t, { entries: [] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /zero entries/);
  assert.equal(ghCalls, "");
});

test("upload.sh refuses an entry lacking a caption, named by index, before any gh call", (t) => {
  const { result, ghCalls } = uploadRun(t, { entries: [{ path: "/x/a.png", caption: "a" }, { path: "/x/b.png" }] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /entry 1 lacks a path or a caption/);
  assert.equal(ghCalls, "");
});

test("upload.sh refuses a file that is not an object with an entries array, or not JSON", (t) => {
  for (const [entries, reason] of [
    ["[]", /not a JSON object/],
    ['{"root": "/"}', /no entries array/],
    ["{", /not valid JSON/],
  ]) {
    const { result, ghCalls } = uploadRun(t, entries);
    assert.equal(result.status, 1, entries);
    assert.match(result.stderr, reason);
    assert.equal(ghCalls, "");
  }
});

test("upload.sh exits 2 naming a missing file tool before any gh call", (t) => {
  const { result, ghCalls } = uploadRun(t, { entries: [{ path: "/x/a.png", caption: "a" }] }, { tools: UPLOAD_TOOLS });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing required tool: file/);
  assert.equal(ghCalls, "");
});

test("upload.sh exits 3 without attaching when gh pr edit has no --attach flag", (t) => {
  const { result, ghCalls, runDir } = uploadRun(t, { entries: [{ path: "/x/a.png", caption: "a" }] }, {
    cases: `  "pr edit --help") echo "Usage: gh pr edit [<number>] [flags]" ;;`,
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /no --attach flag/);
  assert.equal(ghCalls, "pr edit --help\n");
  assert.equal(readFileSync(join(runDir, "assets.tsv"), "utf8"), "");
  assert.ok(existsSync(join(runDir, "failures.tsv")));
});

test("splice.mjs prints the same refused: prefix in splice mode as in --check mode", (t) => {
  const dir = scratch(t);
  const body = join(dir, "body.md");
  const section = join(dir, "section.md");
  writeFileSync(body, "Body.\n");
  writeFileSync(section, "");
  const result = spawnSync(process.execPath, [join(SCRIPTS, "splice.mjs"), "--body-file", body, "--section-file", section, "--landed", "0"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "refused: the section to splice is empty\n");
});
