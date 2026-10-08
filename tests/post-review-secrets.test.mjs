// Fails when post-review.mjs sends gh a report that matches a credential pattern, echoes the
// matched text, or refuses a report that only mentions a token or a bare key prefix.
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
  const binDir = scratchDir(t, "post-review-secrets-bin-");
  const stateDir = scratchDir(t, "post-review-secrets-state-");
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
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
}

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

// A clean checkout whose HEAD is the one commit it holds.
function cleanCheckout(t) {
  const dir = scratchDir(t, "post-review-secrets-checkout-");
  git(dir, "init", "-q");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  git(dir, "add", "--", ".");
  git(dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "1");
  return { dir, headSha: git(dir, "rev-parse", "HEAD") };
}

function writeReport(t, text) {
  const path = join(scratchDir(t, "post-review-secrets-report-"), "report.md");
  writeFileSync(path, text);
  return path;
}

function jsonResponse(value) {
  return { stdout: JSON.stringify(value) };
}

function reportQuoting(text) {
  return `**Verdict: 💬 COMMENT**\n\n### Summary\n\nThe config reads ${text} at startup.\n`;
}

// Each fake credential is split so this file itself matches no secret scanner.
const SECRET_ROWS = [
  { name: "a GitHub token", secret: "gh" + "p_" + "Ab1".repeat(12) },
  { name: "a fine-grained GitHub token", secret: "github" + "_pat_" + "Ab1_".repeat(6) },
  { name: "an AWS access key id", secret: "AK" + "IA" + "ABCDEFGHIJ234567" },
  { name: "a private key header", secret: "-----BEGIN " + "RSA PRIVATE" + " KEY-----" },
  { name: "a Slack token", secret: "xo" + "xb-" + "1234567890-abcdef" },
  { name: "an sk- API key", secret: "s" + "k-" + "proj_Ab1-".repeat(3) },
];

test("a report holding a credential makes no gh call and prints no part of it", async (t) => {
  for (const row of SECRET_ROWS) {
    await t.test(row.name, (st) => {
      const run = runScript(st, {
        cwd: scratchDir(st, "post-review-secrets-cwd-"),
        args: [PR_URL, REVIEWED_SHA, writeReport(st, reportQuoting(row.secret)), "at-head"],
        responses: [],
      });

      assert.deepEqual(run.calls, []);
      assert.equal(run.stdout, "not-posted secret-suspected\n");
      assert.equal(run.status, 1);
      assert.ok(!run.stdout.includes(row.secret) && !run.stderr.includes(row.secret), run.stderr);
    });
  }
});

test("a report that names a token or a bare sk- prefix still posts", (t) => {
  const checkout = cleanCheckout(t);
  const benign = "the token from risk-assessment-service-config, never an sk- key";
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, reportQuoting(benign)), "at-head"],
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
              autoMergeRequest: null,
            },
          },
        },
      }),
      jsonResponse({ id: 9001 }),
      jsonResponse({
        id: 9001,
        html_url: REVIEW_URL,
        state: "COMMENTED",
        commit_id: checkout.headSha,
        user: { login: "me" },
      }),
    ],
  });

  assert.equal(run.stdout, `posted COMMENT ${REVIEW_URL}\n`);
  assert.equal(run.status, 0);
});
