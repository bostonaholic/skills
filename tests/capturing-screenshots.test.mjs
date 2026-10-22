import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  parseFrames,
  previousNames,
  renderManifest,
  statusOf,
} from "../skills/engineering/capturing-screenshots/scripts/finalize.mjs";

const FINALIZE = resolve("skills/engineering/capturing-screenshots/scripts/finalize.mjs");

const FRAME = {
  name: "01-settings-populated",
  route: "/settings",
  state: "populated",
  caption: "The settings form with a saved profile.",
  verdict: "verified",
};

function framesInput(overrides = {}) {
  return { topic: "settings", seeded: true, frames: [FRAME], skipped: [], ...overrides };
}

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "finalize-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [FINALIZE, ...args], { encoding: "utf8" });
}

/** An `<out>` holding `files`, with frames.json and the shoot reports beside it. */
function fixture(t, { files = [], frames = framesInput(), reports = [], manifest } = {}) {
  const dir = scratch(t);
  const out = join(dir, "out");
  mkdirSync(out);
  for (const file of files) writeFileSync(join(out, file), "png");
  if (manifest !== undefined) writeFileSync(join(out, "manifest.md"), manifest);
  const framesPath = join(dir, "frames.json");
  writeFileSync(framesPath, JSON.stringify(frames));
  const shootPaths = reports.map((report, index) => {
    const path = join(dir, `shoot-${index + 1}.json`);
    writeFileSync(path, JSON.stringify(report));
    return path;
  });
  return { dir, out, framesPath, args: [out, framesPath, ...shootPaths, "--date", "2026-10-21"] };
}

function report(...frames) {
  return { frames: frames.map(([name, ok]) => ({ name, ok })) };
}

const REJECTED = {
  shot: "/settings rejected",
  reason: "toast over the form",
  name: "02-settings-rejected",
};

test("statusOf derives captured, partial, and both skipped statuses", () => {
  assert.equal(statusOf(parseFrames(framesInput())), "captured");
  const skip = { shot: "/settings error", reason: "no way to force the error" };
  assert.equal(statusOf(parseFrames(framesInput({ skipped: [skip] }))), "partial");
  assert.equal(
    statusOf(parseFrames(framesInput({ frames: [], skip: "no-tool" }))),
    "skipped-no-tool",
  );
  assert.equal(
    statusOf(parseFrames(framesInput({ frames: [], skip: "server-start" }))),
    "skipped-server-start",
  );
});

test("parseFrames refuses invalid frames.json", () => {
  const cases = [
    [[], /must be a JSON object/],
    [framesInput({ extra: 1 }), /extra: unknown field/],
    [framesInput({ topic: "two\nlines" }), /topic: must be a non-empty single-line/],
    [framesInput({ seeded: "yes" }), /seeded: must be true or false/],
    [framesInput({ seeded: false }), /seed_note: must be a non-empty/],
    [framesInput({ seed_note: "n/a" }), /seed_note: only when seeded is false/],
    [framesInput({ skip: "crashed" }), /skip: must be one of/],
    [framesInput({ skip: "no-tool" }), /frames: must be empty when skip is set/],
    [framesInput({ frames: [] }), /nothing captured or skipped/],
    [framesInput({ frames: [{ ...FRAME, name: "../escape" }] }), /frames\[0\]\.name: must match/],
    [framesInput({ frames: [FRAME, FRAME] }), /frames\[1\]\.name: duplicate name/],
    [framesInput({ frames: [{ ...FRAME, verdict: "looks fine" }] }), /verdict: must be one of/],
    [framesInput({ frames: [{ ...FRAME, caption: "" }] }), /caption: must be a non-empty/],
    [framesInput({ frames: [{ ...FRAME, extra: 1 }] }), /frames\[0\]\.extra: unknown field/],
    [
      framesInput({ skipped: [{ ...REJECTED, name: "02-a/../../b" }] }),
      /skipped\[0\]\.name: must match/,
    ],
    [framesInput({ skipped: [{ shot: "/a" }] }), /skipped\[0\]\.reason: must be a non-empty/],
  ];
  for (const [input, message] of cases) {
    assert.throws(() => parseFrames(input), message, JSON.stringify(input));
  }
});

test("renderManifest writes the frontmatter and the Captured and Skipped layout", () => {
  const parsed = parseFrames(
    framesInput({
      seeded: false,
      seed_note: "no seed script",
      skipped: [{ shot: "/settings error", reason: "no way to force the error" }],
    }),
  );
  assert.equal(
    renderManifest(parsed, "2026-10-21"),
    [
      "---",
      "topic: settings",
      "date: 2026-10-21",
      "status: partial",
      "seeded: false",
      "seed_note: no seed script",
      "---",
      "",
      "## Captured",
      "",
      "### 01-settings-populated.png",
      "",
      "- route: /settings",
      "- state: populated",
      "- caption: The settings form with a saved profile.",
      "- verdict: verified",
      "",
      "## Skipped",
      "",
      "- /settings error: no way to force the error",
      "",
    ].join("\n"),
  );
  const empty = renderManifest(parseFrames(framesInput({ frames: [], skip: "no-tool" })), "d");
  assert.match(empty, /## Captured\n\n- none\n\n## Skipped\n\n- none\n$/);
});

test("previousNames reads frame headings and ignores names that are not shot names", () => {
  const text =
    "### 01-a.png\n### ../../etc/passwd.png\n### notes.png\n- ### 02-b.png\n### 03-c.png\n";
  assert.deepEqual(previousNames(text), ["01-a", "03-c"]);
});

test("finalize writes the manifest, prunes listed files, and reruns as a no-op", (t) => {
  const { out, args } = fixture(t, {
    files: ["01-settings-populated.png", "02-settings-rejected.png", "03-old-populated.png"],
    frames: framesInput({ skipped: [REJECTED] }),
    reports: [report(["01-settings-populated", true], ["02-settings-rejected", true])],
    manifest: "## Captured\n\n### 03-old-populated.png\n",
  });

  const first = run(args);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), {
    status: "partial",
    deleted: ["02-settings-rejected.png", "03-old-populated.png"],
    stray: [],
    missing: [],
  });
  assert.deepEqual(readdirSync(out).sort(), ["01-settings-populated.png", "manifest.md"]);
  const manifest = readFileSync(join(out, "manifest.md"), "utf8");
  assert.match(manifest, /^status: partial$/m);

  const again = run(args);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(again.stdout).deleted, []);
  assert.equal(readFileSync(join(out, "manifest.md"), "utf8"), manifest);
});

test("finalize leaves unlisted files and everything outside out untouched, reporting strays", (t) => {
  const { dir, out, args } = fixture(t, {
    files: ["01-settings-populated.png", "99-user-kept.png", "notes.txt"],
    manifest: "### ../02-outside-populated.png\n### ../../etc/hosts.png\n",
  });
  mkdirSync(join(out, "drafts"));
  writeFileSync(join(dir, "02-outside-populated.png"), "png");

  const result = run(args);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "captured",
    deleted: [],
    stray: ["99-user-kept.png", "drafts", "notes.txt"],
    missing: [],
  });
  assert.ok(existsSync(join(out, "99-user-kept.png")));
  assert.ok(existsSync(join(out, "notes.txt")));
  assert.ok(existsSync(join(dir, "02-outside-populated.png")));
  assert.match(readFileSync(join(out, "manifest.md"), "utf8"), /^status: captured$/m);
});

test("finalize exits 1 without writing or deleting when a kept frame has no PNG", (t) => {
  const { out, args } = fixture(t, {
    files: ["03-old-populated.png"],
    manifest: "### 03-old-populated.png\n",
  });

  const result = run(args);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout).missing, ["01-settings-populated.png"]);
  assert.ok(existsSync(join(out, "03-old-populated.png")));
  assert.equal(readFileSync(join(out, "manifest.md"), "utf8"), "### 03-old-populated.png\n");
});

test("finalize prunes the previous manifest's frames on a skipped run", (t) => {
  const { out, args } = fixture(t, {
    files: ["01-settings-populated.png"],
    frames: framesInput({ frames: [], skip: "server-start" }),
    manifest: "### 01-settings-populated.png\n",
  });

  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "skipped-server-start",
    deleted: ["01-settings-populated.png"],
    stray: [],
    missing: [],
  });
  assert.deepEqual(readdirSync(out), ["manifest.md"]);
});

test("finalize exits 2, changing nothing, when frames contradict the shoot reports", (t) => {
  const failed = fixture(t, {
    files: ["01-settings-populated.png"],
    reports: [report(["01-settings-populated", true]), report(["01-settings-populated", false])],
  });
  const lastFailed = run(failed.args);
  assert.equal(lastFailed.status, 2);
  assert.match(lastFailed.stderr, /01-settings-populated: failed in its last shoot report/);
  assert.deepEqual(readdirSync(failed.out), ["01-settings-populated.png"]);

  const unaccounted = fixture(t, {
    files: ["01-settings-populated.png", "02-settings-rejected.png"],
    reports: [report(["01-settings-populated", true], ["02-settings-rejected", true])],
  });
  const result = run(unaccounted.args);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /02-settings-rejected: is in a shoot report but neither/);
  assert.deepEqual(readdirSync(unaccounted.out).sort(), [
    "01-settings-populated.png",
    "02-settings-rejected.png",
  ]);
});

test("finalize exits 2 on bad usage, a bad date, a missing out, or unreadable JSON", (t) => {
  const { dir, out, framesPath } = fixture(t, { files: ["01-settings-populated.png"] });
  const garbage = join(dir, "garbage.json");
  writeFileSync(garbage, "{ not json");

  const usage = run([]);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /^finalize\.mjs: usage: finalize\.mjs /);
  assert.equal(run([out]).status, 2);
  assert.match(run([out, framesPath, "--date", "21/10/2026"]).stderr, /--date: must be/);
  assert.match(run([join(dir, "nope"), framesPath]).stderr, /is not a directory/);
  assert.match(run([out, garbage]).stderr, /unreadable JSON/);
  assert.match(run([out, framesPath, garbage]).stderr, /unreadable JSON/);
  const noFrames = join(dir, "no-frames.json");
  writeFileSync(noFrames, "{}");
  assert.match(run([out, framesPath, noFrames]).stderr, /shoot report 1: has no frames array/);
  assert.match(run([out, framesPath, framesPath]).stderr, /shoot report 1: frame without ok/);
  assert.deepEqual(readdirSync(out), ["01-settings-populated.png"]);
});
