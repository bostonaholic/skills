// Fails when the attaching-pr-screenshots scripts stop resolving the current
// branch's PR with no PR token, stop refusing a bad entries file before any `gh`
// call, stop treating a missing tool as a fault, stop exiting 3 when `gh pr edit`
// cannot attach, or print a refusal prefix other than `refused:`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/attaching-pr-screenshots/scripts");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command upload.sh runs besides `gh` and `file`.
const UPLOAD_TOOLS = ["jq", "cat", "wc", "tr", "rm", "dirname", "basename", "grep", "node"];

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
  writeFileSync(
    gh,
    `#!${BASH}\nprintf '%s\\n' "$*" >>'${log}'\ncase "$*" in\n${cases}\n  *) exit 1 ;;\nesac\n`,
  );
  chmodSync(gh, 0o755);
  return { bin, log };
}

function run(script, args, bin) {
  return spawnSync(BASH, [join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    env: { PATH: bin },
  });
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
  writeFileSync(
    entriesFile,
    typeof entries === "string" ? entries : JSON.stringify({ root, ...entries }),
  );
  for (const [name, value] of Object.entries({
    "pr-host": "github.com",
    number: "7",
    "repo-spec": "github.com/o/r",
    "entries-file": entriesFile,
  })) {
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
  const { result, ghCalls } = uploadRun(t, {
    entries: [{ path: "/x/a.png", caption: "a" }, { path: "/x/b.png" }],
  });
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
  const { result, ghCalls } = uploadRun(
    t,
    { entries: [{ path: "/x/a.png", caption: "a" }] },
    { tools: UPLOAD_TOOLS },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing required tool: file/);
  assert.equal(ghCalls, "");
});

test("upload.sh exits 3 without attaching when gh pr edit has no --attach flag", (t) => {
  const { result, ghCalls, runDir } = uploadRun(
    t,
    { entries: [{ path: "/x/a.png", caption: "a" }] },
    {
      cases: `  "pr edit --help") echo "Usage: gh pr edit [<number>] [flags]" ;;`,
    },
  );
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
  const result = spawnSync(
    process.execPath,
    [join(SCRIPTS, "splice.mjs"), "--body-file", body, "--section-file", section, "--landed", "0"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    `refused: the section to splice is empty\nsee ${realpathSync(resolve(SCRIPTS, "../SKILL.md"))}\n`,
  );

  const checkBody = join(dir, "check-body.md");
  writeFileSync(checkBody, 'Body <img src="x">\n');
  const check = spawnSync(
    process.execPath,
    [join(SCRIPTS, "splice.mjs"), "--check", "--body-file", checkBody],
    { encoding: "utf8" },
  );
  assert.equal(check.status, 1);
  assert.match(check.stderr, /^refused: the body carries an HTML image tag/);
  assert.equal(check.stdout, "");
});

// --- asset-url.mjs: the one attachment-origin rule ---------------------------

const assetUrl = await import(join(SCRIPTS, "asset-url.mjs"));
const writeBody = await import(join(SCRIPTS, "write-body.mjs"));
const spliceModule = await import(join(SCRIPTS, "splice.mjs"));

const ASSET = "https://github.com/user-attachments/assets/5f0c2a9e-7d41";
const ASSET_2 = "https://github.com/user-attachments/assets/9a63-2c1d";

test("isAttachmentUrl passes only the attachment origin for the PR host", () => {
  const pass = (url, host = "github.com", extra) => assetUrl.isAttachmentUrl(url, host, extra);
  assert.ok(pass(ASSET));
  assert.ok(pass("https://private-user-images.githubusercontent.com/123/456-abc.png?jwt=x"));
  assert.ok(pass("https://ghe.example.com/user-attachments/assets/1", "ghe.example.com"));
  assert.ok(pass("https://private-user-images.ghe.example.com/1/2.webp", "ghe.example.com"));
  assert.ok(
    pass(
      "https://assets.example.com/user-attachments/assets/1",
      "github.com",
      "assets.example.com",
    ),
  );
  for (const url of [
    "http://github.com/user-attachments/assets/1",
    "https://raw.githubusercontent.com/user-attachments/assets/1",
    "https://github.com@evil.example/user-attachments/assets/1",
    "https://github.com:443/user-attachments/assets/1",
    "https://github.com/user-attachments/assets/../../evil/x.png",
    "https://github.com/user-attachments/assets/%2e%2e/x.png",
    "https://github.com/evil/repo/x.png",
    "https://private-user-images.githubusercontent.com/1/2/3.png",
    "https://private-user-images.githubusercontent.com/1/2.svg",
    "https://evil.example/user-attachments/assets/1",
  ]) {
    assert.equal(pass(url), false, url);
  }
});

test("asset-url.mjs filters stdin to passing URLs in order, and exits 2 on bad usage", () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [join(SCRIPTS, "asset-url.mjs"), ...args], {
      encoding: "utf8",
      input,
      env: {},
    });
  const result = run(["github.com"], `https://evil.example/x.png\n${ASSET_2}\n${ASSET}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${ASSET_2}\n${ASSET}\n`);
  assert.equal(run(["github.com"], "").stdout, "");
  for (const args of [[], ["github.com@evil"], ["a", "b"]]) {
    const bad = run(args, "");
    assert.equal(bad.status, 2, args.join(" "));
    assert.match(bad.stderr, /^asset-url\.mjs: usage: /);
  }
});

// --- upload.sh: entry shape refusals, harvest, exit marker -------------------

// The smallest byte run `file` reads as image/png: the signature and an IHDR.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000000000000",
  "hex",
);

test("upload.sh refuses a blank caption, a non-string state, or non-string notes before any gh call", (t) => {
  for (const [entries, reason] of [
    [{ entries: [{ path: "/x/a.png", caption: " \n " }] }, /entry 0 has a blank caption/],
    [{ entries: [{ path: "/x/a.png", caption: "a", state: 3 }] }, /entry 0 has a state/],
    [{ entries: [{ path: "/x/a.png", caption: "a" }], notes: "x" }, /notes that are not an array/],
    [{ entries: [{ path: "/x/a.png", caption: "a" }], notes: [1] }, /notes that are not an array/],
  ]) {
    const { result, ghCalls, runDir } = uploadRun(t, entries);
    assert.equal(result.status, 1, JSON.stringify(entries));
    assert.match(result.stderr, reason);
    assert.equal(ghCalls, "");
    assert.equal(readFileSync(join(runDir, "upload-exit"), "utf8"), "1\n");
  }
});

test("upload.sh exits 2 naming a missing node before any gh call", (t) => {
  const { result, ghCalls } = uploadRun(
    t,
    { entries: [{ path: "/x/a.png", caption: "a" }] },
    { tools: [...UPLOAD_TOOLS, "file"].filter((tool) => tool !== "node") },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing required tool: node/);
  assert.equal(ghCalls, "");
});

test("upload.sh exits 2 when the run directory does not exist", (t) => {
  const dir = scratch(t);
  const { bin } = fakeBin(dir, { tools: [...UPLOAD_TOOLS, "file"] });
  const result = run("upload.sh", [join(dir, "missing-run")], bin);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /run directory has no pr-host/);
  assert.doesNotMatch(result.stderr, /upload-exit/);
});

// One PNG entry against a fake `gh` whose PR body lives in a file: each attach
// appends `tail` to it, and each view returns it.
function uploadOne(t, tail) {
  const dir = scratch(t);
  const state = join(dir, "body.txt");
  writeFileSync(state, "Body.\n");
  writeFileSync(join(dir, "tail.txt"), tail);
  const root = join(dir, "img");
  mkdirSync(root);
  const image = join(root, "login.png");
  writeFileSync(image, PNG);
  const cases = [
    `  "pr edit --help") echo "  -A, --attach file" ;;`,
    `  "pr edit 7 --repo github.com/o/r --attach "*) cat '${join(dir, "tail.txt")}' >>'${state}' ;;`,
    `  "pr view 7 --repo github.com/o/r --json body") printf '{"body":%s}' "$(jq -Rs . <'${state}')" ;;`,
  ].join("\n");
  return uploadRun(t, JSON.stringify({ root, entries: [{ path: image, caption: "login" }] }), {
    cases,
  });
}

test("upload.sh harvests the one attachment URL an attach appended", (t) => {
  const { result, runDir } = uploadOne(t, `\n![login.png](${ASSET})`);
  assert.equal(result.status, 0, result.stderr);
  const [url, path] = readFileSync(join(runDir, "assets.tsv"), "utf8").trimEnd().split("\t");
  assert.equal(url, ASSET);
  assert.match(path, /\/login\.png$/);
  assert.equal(readFileSync(join(runDir, "failures.tsv"), "utf8"), "");
  assert.equal(readFileSync(join(runDir, "upload-exit"), "utf8"), "0\n");
});

test("upload.sh fails an entry whose tail holds two attachment URLs, or none on the origin", (t) => {
  for (const [tail, reason] of [
    [`\n![a](${ASSET}) ![b](${ASSET_2})`, "ambiguous attachment URL"],
    ["\n![a](https://raw.githubusercontent.com/o/r/main/a.png)", "no attachment URL"],
  ]) {
    const { result, runDir } = uploadOne(t, tail);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(runDir, "assets.tsv"), "utf8"), "");
    assert.match(readFileSync(join(runDir, "failures.tsv"), "utf8"), new RegExp(`^${reason}\t`));
  }
});

// --- write-body.mjs: render, splice, write once -------------------------------

function landed(entry, url) {
  return { entry, status: "landed", url, reason: null };
}

function failed(entry, reason) {
  return { entry, status: "failed", url: null, reason };
}

test("renderSection escapes caller text, numbers alts, and separates notes", () => {
  const paired = [
    landed({ path: "/s/a.png", caption: "log[in]  <b>\nform", state: "error (dark)" }, ASSET),
    failed({ path: "/s/b.png", caption: "b" }, "not an image"),
    landed({ path: "/s/c.png", caption: "c!" }, ASSET_2),
  ];
  assert.equal(
    writeBody.renderSection(paired, ["first", "  ", "second\\"]),
    [
      "## Screenshots",
      "",
      "**log\\[in\\] \\<b\\> form** (error dark)",
      `![screenshot-01](${ASSET})`,
      "",
      "**c\\!**",
      `![screenshot-02](${ASSET_2})`,
      "",
      "> _note:_ first",
      ">",
      "> _note:_ second\\\\",
      "",
      "Not uploaded: b — not an image",
      "",
    ].join("\n"),
  );
});

test("renderSection writes the degraded form with basenames when nothing landed", () => {
  const paired = [
    failed({ path: "/home/me/s/a b.png", caption: "a", state: "x" }, "file missing"),
    { entry: { path: "/home/me/s/c.png", caption: "c" }, status: "not-attempted", url: null },
  ];
  assert.equal(
    writeBody.renderSection(paired, []),
    "## Screenshots\n\n**a** (x) — captured, not yet uploaded: a b.png\n\n" +
      "**c** — captured, not yet uploaded: c.png\n",
  );
});

test("a rendered section splices clean and reads as this skill's own on the next run", () => {
  for (const paired of [
    [
      landed({ path: "/s/a.png", caption: "a (b) [c]", state: "s (t" }, ASSET),
      failed({ path: "/s/b.png", caption: "<b>" }, "attach failed"),
    ],
    [{ entry: { path: "/s/a.png", caption: "a", state: "s" }, status: "not-attempted", url: null }],
  ]) {
    const section = writeBody.renderSection(paired, ["one", "two"]);
    const count = paired.filter((item) => item.status === "landed").length;
    const body = "## Summary\n\nBody.\n\n## How to Verify\n\n1. Look.\n";
    const first = spliceModule.splice(body, section, { landed: count });
    assert.equal(first.reason, "");
    assert.equal(spliceModule.bodyRefusal(first.body), "");
  }
});

test("pairEntries walks both TSVs in entries order and throws on anything unaccounted", () => {
  const entries = [{ path: "/a" }, { path: "/b" }, { path: "/a" }];
  const paired = writeBody.pairEntries(
    entries,
    `${ASSET}\t/a\n${ASSET_2}\t/a\n`,
    "file missing\t/b\n",
  );
  assert.deepEqual(
    paired.map((item) => [item.status, item.url ?? item.reason]),
    [
      ["landed", ASSET],
      ["failed", "file missing"],
      ["landed", ASSET_2],
    ],
  );
  assert.deepEqual(
    writeBody.pairEntries([{ path: "/a" }], "", "").map((item) => item.status),
    ["not-attempted"],
  );
  assert.throws(() => writeBody.pairEntries(entries, `${ASSET}\t/a\n`, ""), /entry 1/);
  assert.throws(
    () => writeBody.pairEntries([{ path: "/a" }], `${ASSET}\t/a\n${ASSET}\t/z\n`, ""),
    /no entry/,
  );
  assert.throws(
    () => writeBody.pairEntries([{ path: "/a" }], `${ASSET}\t/a\n`, "x\t/a\n"),
    /both landed and failed/,
  );
});

// A run directory as `upload.sh` leaves it, with `files` overriding any
// default and a null value removing that file.
function finishedRun(t, files = {}, cases = "") {
  const dir = scratch(t);
  const runDir = join(dir, "run");
  mkdirSync(runDir);
  const entriesFile = join(dir, "entries.json");
  writeFileSync(
    entriesFile,
    JSON.stringify({
      root: "/s",
      entries: [
        { path: "/s/login.png", caption: "login", state: "error" },
        { path: "/s/b.png", caption: "b" },
      ],
      notes: ["seeded"],
    }),
  );
  const defaults = {
    "pr-host": "github.com\n",
    owner: "o\n",
    repo: "r\n",
    number: "7\n",
    "repo-spec": "github.com/o/r\n",
    "entries-file": `${entriesFile}\n`,
    "pre-image.md": "## Summary\n\nBody.\n\nCloses #3\n",
    "assets.tsv": `${ASSET}\t/s/login.png\n`,
    "failures.tsv": "file missing\t/s/b.png\n",
    "upload-exit": "0\n",
  };
  for (const [name, value] of Object.entries({ ...defaults, ...files })) {
    if (value !== null) writeFileSync(join(runDir, name), value);
  }
  const { bin, log } = fakeBin(dir, { tools: ["cat"], cases });
  const node = (script, args = []) =>
    spawnSync(process.execPath, [join(SCRIPTS, script), runDir, ...args], {
      encoding: "utf8",
      env: { PATH: bin },
    });
  const read = (name) => readFileSync(join(runDir, name), "utf8");
  return { dir, runDir, node, read, ghCalls: () => readFileSync(log, "utf8") };
}

const EDIT_OK = `  "pr edit 7 --repo github.com/o/r --body-file "*) exit 0 ;;`;

test("write-body.mjs renders, splices, and writes the body once", (t) => {
  const run = finishedRun(t, {}, EDIT_OK);
  const result = run.node("write-body.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "written\n");
  assert.equal(
    run.ghCalls(),
    `pr edit 7 --repo github.com/o/r --body-file ${join(run.runDir, "new-body.md")}\n`,
  );
  assert.match(run.read("section.md"), /^\*\*login\*\* \(error\)\n!\[screenshot-01\]/m);
  assert.match(
    run.read("new-body.md"),
    /^Body\.\n\n## Screenshots\n[\s\S]*Not uploaded: b — file missing\n\nCloses #3\n$/m,
  );
  assert.equal(run.read("write-exit"), "0\n");
});

test("write-body.mjs exits 1 on a splice refusal without editing the PR", (t) => {
  const run = finishedRun(t, { "pre-image.md": 'Body <img src="x">\n' }, EDIT_OK);
  const result = run.node("write-body.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^refused: the body carries an HTML image tag/);
  assert.equal(run.ghCalls(), "");
  assert.equal(existsSync(join(run.runDir, "new-body.md")), false);
  assert.equal(run.read("write-exit"), "1\n");
});

test("write-body.mjs exits 3 when gh pr edit fails", (t) => {
  const run = finishedRun(t);
  const result = run.node("write-body.mjs");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /gh pr edit failed/);
  assert.equal(run.read("write-exit"), "3\n");
});

test("write-body.mjs faults before any gh call on a bad upload exit, run file, or URL", (t) => {
  for (const [files, reason] of [
    [{ "upload-exit": "4\n" }, /upload\.sh ended with exit 4/],
    [{ "upload-exit": null }, /cannot read upload-exit/],
    [{ "assets.tsv": `${ASSET}\t/s/other.png\n` }, /do not account for entry 0/],
    [{ "assets.tsv": "https://evil.example/x.png\t/s/login.png\n" }, /off the attachment origin/],
    [{ "entries-file": "/nonexistent/entries.json\n" }, /cannot read the entries file/],
  ]) {
    const run = finishedRun(t, files, EDIT_OK);
    const result = run.node("write-body.mjs");
    assert.equal(result.status, 2, JSON.stringify(files));
    assert.match(result.stderr, reason);
    assert.equal(run.ghCalls(), "");
    assert.equal(run.read("write-exit"), "2\n");
  }
});

// --- write-result.mjs: outcome, read-back, result.json ------------------------

const LANDED_HTML =
  '<h2>Summary</h2><p>Body.</p><div class="markdown-heading">' +
  '<h2 class="heading-element">Screenshots</h2></div><p><strong>login</strong> (error)<br>' +
  `<a href="${ASSET}"><img src="${ASSET}" alt="screenshot-01" style="max-width: 100%;"></a></p>` +
  '<h2>Pre-merge</h2><img src="https://evil.example/x.png">';

// A finished run whose fake `gh api` returns `bodyHtml`, and `markdownHtml`
// from `POST /markdown`, saving what it was sent.
function resultRun(t, bodyHtml, files = {}, { body = "", markdownHtml = "" } = {}) {
  const dir = scratch(t);
  const pull = join(dir, "pull.json");
  writeFileSync(pull, JSON.stringify({ body, body_html: bodyHtml }));
  const rendered = join(dir, "rendered.html");
  writeFileSync(rendered, markdownHtml);
  const cases = [
    `  "api --hostname github.com repos/o/r/pulls/7 -H Accept: application/vnd.github.full+json") cat '${pull}' ;;`,
    `  "api --hostname github.com --method POST markdown --input -") cat >'${join(dir, "sent.json")}'; cat '${rendered}' ;;`,
  ].join("\n");
  const run = finishedRun(
    t,
    { "write-exit": "0\n", "section.md": "## Screenshots\n", ...files },
    cases,
  );
  return { ...run, sent: () => JSON.parse(readFileSync(join(dir, "sent.json"), "utf8")) };
}

test("write-result.mjs verifies a written body and writes result.json", (t) => {
  const run = resultRun(t, LANDED_HTML);
  const note = join(run.dir, "note.txt");
  writeFileSync(note, "b was missing on disk\n");
  const result = run.node("write-result.mjs", ["--operator-note-file", note]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "outcome partial\n");
  assert.deepEqual(JSON.parse(run.read("result.json")), {
    owner: "o",
    repo: "r",
    number: 7,
    outcome: "partial",
    assets: [
      { caption: "login", path: "/s/login.png", url: ASSET },
      { caption: "b", path: "/s/b.png", url: null },
    ],
    failures: [{ caption: "b", path: "/s/b.png", reason: "file missing" }],
    body_written: true,
    operator_note: "b was missing on disk",
    section: "## Screenshots\n",
  });
});

test("write-result.mjs reports unverified with the failed assertion and a null section", (t) => {
  for (const [html, assertion] of [
    ["<h2>Summary</h2>", "the rendered body has no Screenshots heading"],
    ["<h2>Screenshots</h2><p>login</p>", "screenshot-01 has no rendered image"],
    [
      '<h2>Screenshots</h2><img alt="screenshot-01" src="https://evil.example/user-attachments/assets/1">',
      "image 1 in the section is not on the attachment origin",
    ],
  ]) {
    const run = resultRun(t, html);
    const result = run.node("write-result.mjs");
    assert.equal(result.status, 1, html);
    assert.equal(result.stdout, `outcome unverified\nfailed ${assertion}\n`);
    const written = JSON.parse(run.read("result.json"));
    assert.equal(written.section, null);
    assert.equal(written.body_written, true);
  }
});

test("write-result.mjs reports unverified when the read-back call fails, after gh's own error", (t) => {
  const run = finishedRun(
    t,
    { "write-exit": "0\n" },
    `  "api --hostname github.com repos/o/r/pulls/7 "*) printf 'gh: read sentinel' >&2; exit 1 ;;`,
  );
  const result = run.node("write-result.mjs");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "outcome unverified\nfailed the body could not be read back\n");
  assert.equal(result.stderr, "gh: read sentinel\n");
});

test("write-result.mjs shows gh's error when POST /markdown fails", (t) => {
  const dir = scratch(t);
  const pull = join(dir, "pull.json");
  writeFileSync(pull, JSON.stringify({ body: "## Screenshots\n", body_html: "" }));
  const run = finishedRun(
    t,
    { "write-exit": "0\n" },
    [
      `  "api --hostname github.com repos/o/r/pulls/7 "*) cat '${pull}' ;;`,
      `  "api --hostname github.com --method POST markdown --input -") echo 'gh: render sentinel' >&2; exit 1 ;;`,
    ].join("\n"),
  );
  const result = run.node("write-result.mjs");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "outcome unverified\nfailed the body could not be read back\n");
  assert.equal(result.stderr, "gh: render sentinel\n");
});

test("write-result.mjs renders the stored body through POST /markdown when body_html is empty", (t) => {
  const run = resultRun(t, "", {}, { body: "## Screenshots\n", markdownHtml: LANDED_HTML });
  const result = run.node("write-result.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "outcome partial\n");
  assert.deepEqual(run.sent(), { text: "## Screenshots\n", mode: "gfm", context: "o/r" });
});

test("write-result.mjs checks a degraded write as text", (t) => {
  const files = { "assets.tsv": "", "failures.tsv": "", "upload-exit": "3\n" };
  const degraded =
    "<h2>Screenshots</h2><p><strong>login</strong> (error) — captured, not yet uploaded: " +
    "login.png</p><p><strong>b</strong> — captured, not yet uploaded: b.png</p>";
  const pass = resultRun(t, degraded, files);
  const passed = pass.node("write-result.mjs");
  assert.equal(passed.stdout, "outcome degraded\n", passed.stderr);
  assert.equal(JSON.parse(pass.read("result.json")).section, null);

  const fail = resultRun(t, degraded.replace("b.png", "other.png"), files);
  assert.equal(
    fail.node("write-result.mjs").stdout,
    "outcome unverified\nfailed the basename of entry 1 does not appear as text\n",
  );
});

test("write-result.mjs decides outcomes without a read-back when no body was written", (t) => {
  const allFailed = { "assets.tsv": "", "failures.tsv": "x\t/s/login.png\ny\t/s/b.png\n" };
  for (const [files, outcome] of [
    [{ "upload-exit": null }, "refused"],
    [{ "upload-exit": "1\n" }, "refused"],
    [{ "upload-exit": "4\n" }, "uploaded-not-written"],
    [{ "write-exit": "1\n" }, "uploaded-not-written"],
    [{ "write-exit": "3\n" }, "uploaded-not-written"],
    [{ "write-exit": "1\n", ...allFailed }, "refused"],
  ]) {
    const run = finishedRun(t, files);
    const result = run.node("write-result.mjs");
    assert.equal(result.status, 0, `${JSON.stringify(files)}: ${result.stderr}`);
    assert.equal(result.stdout, `outcome ${outcome}\n`);
    assert.equal(run.ghCalls(), "");
    const written = JSON.parse(run.read("result.json"));
    assert.equal(written.body_written, false);
    assert.equal(written.section, null);
  }
});

test("write-result.mjs faults and writes nothing on an unfinished or faulted run", (t) => {
  for (const [files, args, reason] of [
    [{}, [], /write-body\.mjs has not run/],
    [{ "upload-exit": "2\n" }, [], /upload\.sh faulted/],
    [{ "upload-exit": "9\n" }, [], /not an upload\.sh exit code/],
    [{ "write-exit": "0\n" }, ["--operator-note-file"], /usage: /],
    [
      { "write-exit": "1\n" },
      ["--operator-note-file", "/nonexistent/note"],
      /cannot read the operator note file/,
    ],
  ]) {
    const run = finishedRun(t, files);
    const result = run.node("write-result.mjs", args);
    assert.equal(result.status, 2, JSON.stringify(files));
    assert.match(result.stderr, reason);
    assert.equal(existsSync(join(run.runDir, "result.json")), false);
  }
});

test("splice.mjs --check exits 0 with empty stderr on a body that passes", (t) => {
  const dir = scratch(t);
  const body = join(dir, "body.md");
  writeFileSync(body, "Body with no image tag.\n");
  const check = spawnSync(
    process.execPath,
    [join(SCRIPTS, "splice.mjs"), "--check", "--body-file", body],
    { encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stderr, "");
});

function lineStartIndex(text, prefix) {
  return text.split("\n").findIndex((line) => line.startsWith(prefix));
}

test("upload.sh passes jq's and file's own error text through", async (t) => {
  await t.test("a malformed entries file shows jq's text, then the refusal", (st) => {
    const { result, ghCalls } = uploadRun(st, "{");
    assert.equal(result.status, 1, result.stderr);
    const tool = lineStartIndex(result.stderr, "jq: ");
    const own = result.stderr.split("\n").indexOf("the entries file is not valid JSON");
    assert.notEqual(tool, -1, `jq's line is missing from stderr:\n${result.stderr}`);
    assert.notEqual(own, -1, `the refusal is not its own line:\n${result.stderr}`);
    assert.ok(tool < own, `jq's line is not before the refusal:\n${result.stderr}`);
    assert.equal(ghCalls, "");
  });

  await t.test("a JSON value followed by garbage forwards jq's text, not the shape check", (st) => {
    const { result, ghCalls } = uploadRun(st, "{} oops");
    assert.equal(result.status, 1, result.stderr);
    const lines = result.stderr.split("\n");
    assert.notEqual(
      lineStartIndex(result.stderr, "jq: "),
      -1,
      `jq's line is missing:\n${result.stderr}`,
    );
    assert.ok(
      !lines.includes("the entries file has no entries array"),
      `the script's own shape check reached stderr:\n${result.stderr}`,
    );
    assert.ok(lines.includes("the entries file is not valid JSON"), result.stderr);
    assert.equal(ghCalls, "");
  });

  await t.test("a failed file call shows file's text and still records not an image", (st) => {
    const dir = scratch(st);
    const runDir = join(dir, "run");
    const root = join(dir, "shots");
    mkdirSync(runDir);
    mkdirSync(root);
    writeFileSync(join(root, "a.png"), "not really a png\n");
    const entriesFile = join(dir, "entries.json");
    writeFileSync(
      entriesFile,
      JSON.stringify({ root, entries: [{ path: join(root, "a.png"), caption: "a" }] }),
    );
    writeFileSync(join(runDir, "pr-host"), "github.com\n");
    writeFileSync(join(runDir, "number"), "7\n");
    writeFileSync(join(runDir, "repo-spec"), "github.com/o/r\n");
    writeFileSync(join(runDir, "entries-file"), `${entriesFile}\n`);
    writeFileSync(join(runDir, "pre-image.md"), "Body.\n");
    const { bin } = fakeBin(dir, {
      tools: UPLOAD_TOOLS,
      cases: `  "pr edit --help") echo "  --attach file" ;;`,
    });
    writeFileSync(
      join(bin, "file"),
      `#!${BASH}\necho "file-sentinel: could not find any valid magic files" >&2\nexit 1\n`,
    );
    chmodSync(join(bin, "file"), 0o755);

    const result = run("upload.sh", [runDir], bin);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^file-sentinel: could not find any valid magic files$/m);
    assert.equal(
      readFileSync(join(runDir, "failures.tsv"), "utf8"),
      `not an image\t${join(root, "a.png")}\n`,
    );
  });
});
