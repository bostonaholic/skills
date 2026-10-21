// Fails when a skill script's CLI entry guard skips the CLI for a script run through a
// symlinked directory (as under macOS /tmp → /private/tmp), or runs it on import.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const IMPORTER =
  'import { pathToFileURL } from "node:url";\nawait import(pathToFileURL(process.argv[2]).href);\n';

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "entry-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function symlinkedDir(t, target) {
  const link = join(scratchDir(t), "link");
  symlinkSync(resolve(target), link);
  return link;
}

function runScript(path) {
  return spawnSync(process.execPath, [path], { encoding: "utf8" });
}

function importModule(t, path) {
  const importer = join(scratchDir(t), "importer.mjs");
  writeFileSync(importer, IMPORTER);
  const run = spawnSync(process.execPath, [importer, path], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

test("resolve-transcript.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "resolve-transcript.mjs"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: resolve-transcript\.mjs </);
});

test("write-target.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "write-target.mjs"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: write-target\.mjs </);
});

test("list-sessions.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "list-sessions.mjs"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: list-sessions\.mjs </);
});

test("importing list-sessions.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "list-sessions.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("splice.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/attaching-pr-screenshots/scripts"), "splice.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^splice\.mjs: usage: splice\.mjs /);
});

test("importing resolve-transcript.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "resolve-transcript.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing write-target.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/productivity/running-retros/scripts"), "write-target.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing splice.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/attaching-pr-screenshots/scripts"), "splice.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("png-check.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/capturing-screenshots/scripts"), "png-check.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^png-check\.mjs: usage: png-check\.mjs /);
});

test("shoot.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/capturing-screenshots/scripts"), "shoot.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^shoot\.mjs: usage: shoot\.mjs /);
});

test("importing png-check.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/capturing-screenshots/scripts"), "png-check.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing shoot.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/capturing-screenshots/scripts"), "shoot.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("render-report.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/auditing-tests/scripts"), "render-report.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^render-report\.mjs: usage: render-report\.mjs /);
});

test("importing render-report.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-tests/scripts"), "render-report.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("auditing-complexity/inventory.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/auditing-complexity/scripts"), "inventory.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^inventory\.mjs: usage: inventory\.mjs /);
});

test("importing auditing-complexity/inventory.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-complexity/scripts"), "inventory.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("auditing-complexity/render-report.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/auditing-complexity/scripts"), "render-report.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^render-report\.mjs: usage: render-report\.mjs /);
});

test("importing auditing-complexity/render-report.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-complexity/scripts"), "render-report.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("re-request-review.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(
      symlinkedDir(t, "skills/engineering/addressing-pr-comments/scripts"),
      "re-request-review.mjs",
    ),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^re-request-review\.mjs: usage: re-request-review\.mjs /);
});

test("fetch-pr-feedback.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = spawnSync(
    process.execPath,
    [join(symlinkedDir(t, "shared/scripts"), "fetch-pr-feedback.mjs"), "--bogus"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^fetch-pr-feedback\.mjs: usage: fetch-pr-feedback\.mjs /);
});

test("importing fetch-pr-feedback.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "shared/scripts"), "fetch-pr-feedback.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing re-request-review.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(
      symlinkedDir(t, "skills/engineering/addressing-pr-comments/scripts"),
      "re-request-review.mjs",
    ),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("collect-friction.mjs run through a symlinked directory reaches its usage error", (t) => {
  const script = join(
    symlinkedDir(t, "skills/engineering/summarizing-friction-logs/scripts"),
    "collect-friction.mjs",
  );
  const run = spawnSync(process.execPath, [script, "--bogus"], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^collect-friction\.mjs: usage: collect-friction\.mjs /);
});

test("importing collect-friction.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(
      symlinkedDir(t, "skills/engineering/summarizing-friction-logs/scripts"),
      "collect-friction.mjs",
    ),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});
for (const script of ["analyze.mjs", "render-plan.mjs", "act.mjs"]) {
  const dir = "skills/engineering/merging-dependabot-prs/scripts";
  const name = script.replace(/\./g, "\\.");

  test(`merging-dependabot-prs/${script} run through a symlinked directory reaches its usage error`, (t) => {
    // Four `x` arguments are invalid for each script, so each stops at usage before calling gh.
    const run = spawnSync(
      process.execPath,
      [join(symlinkedDir(t, dir), script), "x", "x", "x", "x"],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 2);
    assert.match(run.stderr, new RegExp(`^${name}: usage: ${name} `));
  });

  test(`importing merging-dependabot-prs/${script} through a symlinked directory has no side effects`, (t) => {
    const run = importModule(t, join(symlinkedDir(t, dir), script));
    assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
  });
}
test("ci-gate.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/landing-prs/scripts"), "ci-gate.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^ci-gate\.mjs: usage: ci-gate\.mjs /);
});

test("importing ci-gate.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/landing-prs/scripts"), "ci-gate.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("scan-deps.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/auditing-repo-security/scripts"), "scan-deps.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^scan-deps\.mjs: usage: scan-deps\.mjs /);
});

test("importing scan-deps.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-repo-security/scripts"), "scan-deps.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("score.mjs run through a symlinked directory reaches its usage error", (t) => {
  // score.mjs reads findings from stdin, so only an argument triggers its usage error.
  const script = join(
    symlinkedDir(t, "skills/engineering/auditing-repo-security/scripts"),
    "score.mjs",
  );
  const run = spawnSync(process.execPath, [script, "findings.json"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^score\.mjs: usage: score\.mjs /);
});

test("importing score.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-repo-security/scripts"), "score.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("find-leads.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/auditing-rails-tech-debt/scripts"), "find-leads.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^find-leads\.mjs: usage: find-leads\.mjs /);
});

test("importing find-leads.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/auditing-rails-tech-debt/scripts"), "find-leads.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

for (const script of ["gap-inventory.mjs", "ready-slots.mjs"]) {
  const dir = "skills/engineering/grooming-backlogs/scripts";

  test(`${script} run through a symlinked directory reaches its usage error`, (t) => {
    const run = runScript(join(symlinkedDir(t, dir), script));
    assert.equal(run.status, 2);
    assert.ok(run.stderr.startsWith(`${script}: usage: ${script} `), run.stderr);
  });

  test(`importing ${script} through a symlinked directory has no side effects`, (t) => {
    const run = importModule(t, join(symlinkedDir(t, dir), script));
    assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
  });
}

test("resolve-timeframe.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(
      symlinkedDir(t, "skills/productivity/summarizing-shipped-work/scripts"),
      "resolve-timeframe.mjs",
    ),
  );
  assert.equal(run.status, 64);
  assert.match(run.stderr, /^resolve-timeframe\.mjs: usage: resolve-timeframe\.mjs /);
});

test("importing resolve-timeframe.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(
      symlinkedDir(t, "skills/productivity/summarizing-shipped-work/scripts"),
      "resolve-timeframe.mjs",
    ),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("check-report.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(
    join(symlinkedDir(t, "skills/engineering/removing-comments/scripts"), "check-report.mjs"),
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^check-report\.mjs: usage: check-report\.mjs /);
});

test("importing check-report.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(
    t,
    join(symlinkedDir(t, "skills/engineering/removing-comments/scripts"), "check-report.mjs"),
  );
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});
