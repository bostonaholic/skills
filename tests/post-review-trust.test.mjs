// Fails when post-review.mjs reads a verdict word with any prefix but a verdict emoji as a
// verdict, or posts an APPROVE through the CLI while the PR has auto-merge on.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../skills/engineering/reviewing-code/scripts/post-review.mjs", import.meta.url),
);

// The user's global git config (signing, identity) must never reach a fixture repository.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SCRIPT_TIMEOUT_MS = 30_000;

const PR_URL = "https://github.com/o/r/pull/412";
const REVIEW_URL = `${PR_URL}#pullrequestreview-9001`;
const REVIEWED_SHA = "1111111111111111111111111111111111111111";

const APPROVE_REPORT = "**Verdict: ✅ APPROVE**\n\n### Summary\n\nAll done criteria met.\n";
const NOT_APPROVE_REPORT = "**Verdict: NOT APPROVE**\n\n### Summary\n\nA steered verdict.\n";

// The fake records each call's argv and answers with the next canned response.
const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const stateDir = process.env.FAKE_GH_STATE;
appendFileSync(join(stateDir, "calls.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
const counterPath = join(stateDir, "counter");
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
const response = JSON.parse(readFileSync(join(stateDir, "responses.json"), "utf8"))[index];
if (response === undefined) {
  process.stderr.write("unexpected gh call\\n");
  process.exit(99);
}
process.stdout.write(response.stdout);
process.exit(0);
`;

function scratchDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runScript(t, { cwd, args, responses }) {
  const binDir = scratchDir(t, "post-review-trust-bin-");
  const stateDir = scratchDir(t, "post-review-trust-state-");
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: SCRIPT_TIMEOUT_MS,
    env: { ...GIT_ENV, PATH: `${binDir}${delimiter}${process.env.PATH}`, FAKE_GH_STATE: stateDir },
  });
  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stderr: result.stderr, lines, calls };
}

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

// A clean checkout whose HEAD is the one commit it holds.
function cleanCheckout(t) {
  const dir = scratchDir(t, "post-review-trust-checkout-");
  git(dir, "init", "-q");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  git(dir, "add", "--", ".");
  git(dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "1");
  return { dir, headSha: git(dir, "rev-parse", "HEAD") };
}

function writeReport(t, text) {
  const path = join(scratchDir(t, "post-review-trust-report-"), "report.md");
  writeFileSync(path, text);
  return path;
}

function jsonResponse(value) {
  return { stdout: JSON.stringify(value) };
}

function review(state, commitId) {
  return jsonResponse({
    id: 9001,
    html_url: REVIEW_URL,
    state,
    commit_id: commitId,
    user: { login: "me" },
  });
}

test("a verdict word after a prefix that is not a verdict emoji exits 2 with no gh call", (t) => {
  const reportPath = writeReport(t, NOT_APPROVE_REPORT);
  const run = runScript(t, {
    cwd: scratchDir(t, "post-review-trust-cwd-"),
    args: [PR_URL, REVIEWED_SHA, reportPath, "at-head"],
    responses: [],
  });

  assert.equal(run.status, 2);
  assert.match(run.stderr, /^post-review\.mjs: the report's first line is not a/m);
  assert.deepEqual(run.calls, []);
  assert.deepEqual(run.lines, []);
});

test("an APPROVE on a PR with auto-merge on posts COMMENT through the CLI", (t) => {
  const checkout = cleanCheckout(t);
  const reportPath = writeReport(t, APPROVE_REPORT);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, reportPath, "at-head"],
    responses: [
      jsonResponse({
        data: {
          viewer: { login: "me" },
          repository: {
            pullRequest: {
              author: { login: "alice" },
              authorAssociation: "MEMBER",
              state: "OPEN",
              headRefOid: checkout.headSha,
              autoMergeRequest: { enabledAt: "2026-10-08T12:00:00Z" },
            },
          },
        },
      }),
      review("COMMENTED", checkout.headSha),
      review("COMMENTED", checkout.headSha),
    ],
  });

  assert.ok(run.calls[1]?.includes("event=COMMENT"), `POST argv: ${JSON.stringify(run.calls[1])}`);
  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "downgraded APPROVE auto-merge"]);
  assert.equal(run.status, 0);
});
