import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  renderReport,
  validateReport,
} from "../skills/engineering/auditing-tests/scripts/render-report.mjs";

const RENDER = resolve("skills/engineering/auditing-tests/scripts/render-report.mjs");

const EVIDENCE = {
  location: "tests/cache.test.js:40 clears on write",
  origin: "a1b2c3d added it with the first cache",
  caughtBug: "none; the mock clears the cache itself",
  callers: "src/store.js:12",
  remainingProof: "tests/store.test.js:88 write invalidates cached read",
  freedCode: "src/cache.js:9 resetForTests export",
  riskAndCommand: "low; node --test tests/store.test.js",
};

function report(overrides = {}) {
  return {
    version: 1,
    scope: {
      root: "demo",
      paths: [],
      discovery: "git ls-files '*.test.js'",
      commit: "abc1234",
      date: "2026-09-30",
    },
    baseline: { command: "node --test", status: "ran", failures: [] },
    inventory: ["tests/cache.test.js", "tests/store.test.js"],
    lanes: [
      {
        name: "cache",
        owner: ["src/cache.js"],
        files: ["tests/cache.test.js", "tests/store.test.js"],
        tests: [
          {
            id: "tests/store.test.js::write invalidates cached read",
            name: "write invalidates cached read",
            file: "tests/store.test.js",
            line: 88,
            mark: "R",
            contract: "a write evicts the cached value",
            catches: "stale reads after a write",
          },
          {
            id: "tests/cache.test.js::clears on write",
            name: "clears on write",
            file: "tests/cache.test.js",
            line: 40,
            mark: "D",
            junkClass: "promises-more-than-checked",
            evidence: { ...EVIDENCE },
            verified: true,
          },
        ],
        testOnlyCode: [
          {
            location: "src/cache.js:9",
            kind: "export",
            freedBy: ["tests/cache.test.js::clears on write"],
          },
        ],
      },
    ],
    layers: [],
    downgraded: [],
    gaps: [],
    ...overrides,
  };
}

test("a complete report has no validation errors", () => {
  assert.deepEqual(validateReport(report()), []);
});

test("a delete candidate missing one evidence field is rejected with that field named", () => {
  const broken = report();
  delete broken.lanes[0].tests[1].evidence.remainingProof;
  assert.deepEqual(validateReport(broken), [
    "tests/cache.test.js::clears on write: mark D requires evidence.remainingProof; complete it or mark the test R",
  ]);
});

test("a delete candidate that fails on the baseline is rejected as a product-bug lead", () => {
  const broken = report({
    baseline: {
      command: "node --test",
      status: "ran",
      failures: [
        { file: "tests/cache.test.js", name: "clears on write", assertion: "expected 0, got 1" },
      ],
    },
  });
  assert.deepEqual(validateReport(broken), [
    "tests/cache.test.js::clears on write: fails on the baseline, so it is a product-bug lead and cannot be marked D",
  ]);
});

test("an unverified delete candidate is rejected", () => {
  const broken = report();
  delete broken.lanes[0].tests[1].verified;
  assert.deepEqual(validateReport(broken), [
    "tests/cache.test.js::clears on write: mark D requires verified: true",
  ]);
});

test("an inventory file placed in no lane and no gap is rejected", () => {
  const broken = report({
    inventory: ["tests/cache.test.js", "tests/store.test.js", "tests/orphan.test.js"],
  });
  assert.deepEqual(validateReport(broken), ["tests/orphan.test.js is in no lane and no gap"]);
});

test("a JSON array is rejected as a report", () => {
  assert.deepEqual(validateReport([report()]), ["report is not a JSON object"]);
});

test("a lane that still carries the retired seams field is rejected with the replacement named", () => {
  const broken = report();
  broken.lanes[0].seams = broken.lanes[0].testOnlyCode;
  delete broken.lanes[0].testOnlyCode;
  assert.deepEqual(validateReport(broken), [
    "lane cache has a seams field; rename it to testOnlyCode",
  ]);
});

test("a lane that is not an object is rejected by position", () => {
  const broken = report();
  broken.lanes.push(null);
  assert.deepEqual(validateReport(broken), ["lanes[1] is not an object"]);
});

test("a test that is not an object is rejected by lane and position", () => {
  const broken = report();
  broken.lanes[0].tests.push(null);
  assert.deepEqual(validateReport(broken), ["lane cache tests[2] is not an object"]);
});

test("test-only code freed by an unknown test is rejected with its location named", () => {
  const broken = report();
  broken.lanes[0].testOnlyCode[0].freedBy = ["tests/cache.test.js::no such test"];
  assert.deepEqual(validateReport(broken), [
    "testOnlyCode src/cache.js:9 names unknown test tests/cache.test.js::no such test",
  ]);
});

test("the rendered test-only code table lists the freed location", () => {
  const section = renderReport(report()).split("## Test-only code\n")[1].split("\n## ")[0];
  assert.match(
    section,
    /\| src\/cache\.js:9 \| export \| tests\/cache\.test\.js::clears on write \|/,
  );
});

test("the rendered summary counts each mark", () => {
  const markdown = renderReport(report());
  assert.match(markdown, /\| R: retain \| 1 \|/);
  assert.match(markdown, /\| D: delete \| 1 \|/);
});

test("the rendered delete table carries the remaining proof", () => {
  const markdown = renderReport(report());
  assert.match(
    markdown,
    /\| cache \| tests\/cache\.test\.js:40 clears on write \| promises-more-than-checked \|.*tests\/store\.test\.js:88 write invalidates cached read/,
  );
});

test("the CLI rejects an invalid report and writes no markdown", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "audit-tests-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const broken = report({ version: 2 });
  writeFileSync(join(dir, "report.json"), JSON.stringify(broken));
  const run = spawnSync(process.execPath, [RENDER, join(dir, "report.json")], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /- version must be 1/);
  assert.equal(existsSync(join(dir, "report.md")), false);
});

function cliDir(t, contents) {
  const dir = mkdtempSync(join(tmpdir(), "audit-tests-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "report.json"), JSON.stringify(contents));
  return dir;
}

test("the CLI refuses to write through a symlinked report.md", (t) => {
  const dir = cliDir(t, report());
  writeFileSync(join(dir, "victim.md"), "original\n");
  symlinkSync(join(dir, "victim.md"), join(dir, "report.md"));
  const run = spawnSync(process.execPath, [RENDER, join(dir, "report.json")], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^render-report\.mjs: .*report\.md is a symlink/);
  assert.equal(readFileSync(join(dir, "victim.md"), "utf8"), "original\n");
});

test("the CLI names a report.md it cannot write", (t) => {
  const dir = cliDir(t, report());
  mkdirSync(join(dir, "report.md"));
  const run = spawnSync(process.execPath, [RENDER, join(dir, "report.json")], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^render-report\.mjs: cannot write .*report\.md/);
});
