// Exercises scripts/check-pr-body.mjs against synthetic pull request templates. Fails when a body
// that carries the template's "## Pre-merge" heading and its first task item, in any box state or
// with CRLF line ends, is rejected; when a body without them passes; when a template with no task
// item under the heading, a missing template, or an argument does not exit 1; or when the real
// .github/pull_request_template.md fails as its own body.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(".");
const CHECK = resolve("scripts/check-pr-body.mjs");

const TEMPLATE =
  "## Summary\n\n<!-- What changed and why. -->\n\n## Pre-merge\n\n- [ ] Widget docs match: each file this change makes stale is updated, or the body says why none were.\n\n## Notes\n";

// Runs the check in a temporary directory that holds `template` as the pull request template,
// or no template when `template` is null. An undefined `body` removes PR_BODY.
function runCheck(t, { template = TEMPLATE, body, args = [] }) {
  assert.ok(existsSync(CHECK), `missing ${CHECK}`);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "check-pr-body-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (template !== null) {
    mkdirSync(join(root, ".github"));
    writeFileSync(join(root, ".github/pull_request_template.md"), template);
  }
  const env = { ...process.env };
  delete env.PR_BODY;
  if (body !== undefined) env.PR_BODY = body;
  const run = spawnSync(process.execPath, [CHECK, ...args], { cwd: root, env, encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

test("check-pr-body judges a body against a synthetic template", async (t) => {
  const pass = { status: 0, stdout: "", stderr: "" };
  const noHeading =
    'PR body: rule 13 has no "## Pre-merge" heading\nCopy the section from .github/pull_request_template.md.\n';
  const noItem =
    'PR body: rule 13 "## Pre-merge" has no "- [ ] Widget docs match" item\nCopy the section from .github/pull_request_template.md.\n';

  await t.test("the template text itself passes", (t) => {
    assert.deepEqual(runCheck(t, { body: TEMPLATE }), pass);
  });

  await t.test("a [x] box passes", (t) => {
    const body = "## Summary\n\nFix.\n\n## Pre-merge\n\n- [x] Widget docs match: README updated.\n";
    assert.deepEqual(runCheck(t, { body }), pass);
  });

  await t.test("a [X] box passes", (t) => {
    const body = "## Summary\n\nFix.\n\n## Pre-merge\n\n- [X] Widget docs match: README updated.\n";
    assert.deepEqual(runCheck(t, { body }), pass);
  });

  await t.test("an unchecked box passes", (t) => {
    const body = "## Summary\n\nFix.\n\n## Pre-merge\n\n- [ ] Widget docs match: not yet.\n";
    assert.deepEqual(runCheck(t, { body }), pass);
  });

  await t.test("CRLF line ends pass", (t) => {
    const body =
      "## Summary\r\n\r\nFix.\r\n\r\n## Pre-merge\r\n\r\n- [x] Widget docs match: none needed.\r\n";
    assert.deepEqual(runCheck(t, { body }), pass);
  });

  await t.test("a template item with no colon makes its whole text the prefix", (t) => {
    const template = "## Pre-merge\n\n- [ ] Widget docs match\n";
    const body = "## Pre-merge\n\n- [x] Widget docs match, since only tests changed\n";
    assert.deepEqual(runCheck(t, { template, body }), pass);
  });

  await t.test("a body with no ## Pre-merge heading fails", (t) => {
    const run = runCheck(t, { body: "## Summary\n\nFix the widget.\n" });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noHeading);
  });

  await t.test("a ## Pre-Merge heading fails and quotes the expected heading", (t) => {
    const body = "## Summary\n\nFix.\n\n## Pre-Merge\n\n- [x] Widget docs match: yes.\n";
    const run = runCheck(t, { body });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noHeading);
  });

  await t.test("an item with another prefix fails", (t) => {
    const body = "## Summary\n\nFix.\n\n## Pre-merge\n\n- [x] Tests pass: yes.\n";
    const run = runCheck(t, { body });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noItem);
  });

  await t.test("the item after the next ## heading fails", (t) => {
    const body = "## Pre-merge\n\nSee below.\n\n## Notes\n\n- [x] Widget docs match: yes.\n";
    const run = runCheck(t, { body });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noItem);
  });

  await t.test("PR_BODY unset fails", (t) => {
    const run = runCheck(t, { body: undefined });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noHeading);
  });

  await t.test("PR_BODY empty fails", (t) => {
    const run = runCheck(t, { body: "" });
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.stderr, noHeading);
  });
});

test("check-pr-body exits 1 on a template it cannot use or an argument", async (t) => {
  const body = "## Pre-merge\n\n- [x] Widget docs match: yes.\n";

  await t.test("a template with no task item under ## Pre-merge names the template", (t) => {
    const template = "## Pre-merge\n\nNo checklist yet.\n\n## Notes\n\n- [ ] Widget docs match\n";
    const run = runCheck(t, { template, body });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^PR body: rule 13 [^\n]*\.github\/pull_request_template\.md/);
  });

  await t.test("a missing template", (t) => {
    const run = runCheck(t, { template: null, body });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^PR body: rule 13 cannot read \.github\/pull_request_template\.md$/m);
  });

  await t.test("an argument", (t) => {
    const run = runCheck(t, { body, args: ["--strict"] });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^usage: node scripts\/check-pr-body\.mjs/);
  });
});

test("the real pull request template passes as its own body", () => {
  assert.ok(existsSync(CHECK), `missing ${CHECK}`);
  const env = {
    ...process.env,
    PR_BODY: readFileSync(join(REPO, ".github/pull_request_template.md"), "utf8"),
  };
  const run = spawnSync(process.execPath, [CHECK], { cwd: REPO, env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, "");
});
