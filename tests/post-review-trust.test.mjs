// Fails when post-review.mjs posts an APPROVE on a PR whose author is not an owner, member, or
// collaborator (or whose association is missing), lowers a REQUEST CHANGES for that reason, reads
// a verdict word with any prefix but a verdict emoji as a verdict, posts an APPROVE through the
// CLI while the PR has auto-merge on, or accepts `.` or `..` as a PR URL's owner or repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL(
  "../skills/engineering/reviewing-code/scripts/post-review.mjs",
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);
const { decideReview } = await import(scriptUrl.href);

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

// A GraphQL read of an open PR by alice, with `authorAssociation` omitted when undefined.
function prRead({ headRefOid, authorAssociation, autoMerge = false }) {
  return jsonResponse({
    data: {
      viewer: { login: "me" },
      repository: {
        pullRequest: {
          author: { login: "alice" },
          authorAssociation,
          state: "OPEN",
          headRefOid,
          autoMergeRequest: autoMerge ? { enabledAt: "2026-10-08T12:00:00Z" } : null,
        },
      },
    },
  });
}

// Facts for an open PR by someone else, auto-merge off, head unmoved, checkout at the head.
function prFacts(fields) {
  return {
    verdict: "APPROVE",
    viewerLogin: "me",
    authorLogin: "alice",
    state: "OPEN",
    autoMerge: false,
    currentHeadSha: REVIEWED_SHA,
    reviewedHeadSha: REVIEWED_SHA,
    inputFlag: "at-head",
    postTimeCheckPassed: true,
    ...fields,
  };
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

const DOT_SEGMENT_URLS = ["https://github.com/../r/pull/412", "https://github.com/o/./pull/412"];

test("a PR URL whose owner or repository is a dot segment exits 2 with no gh call", async (t) => {
  for (const prUrl of DOT_SEGMENT_URLS) {
    await t.test(prUrl, (st) => {
      const run = runScript(st, {
        cwd: scratchDir(st, "post-review-trust-cwd-"),
        args: [prUrl, REVIEWED_SHA, writeReport(st, APPROVE_REPORT), "at-head"],
        responses: [],
      });

      assert.equal(run.status, 2);
      assert.match(run.stderr, /^post-review\.mjs: the PR URL does not match/m);
      assert.deepEqual(run.calls, []);
    });
  }
});

test("an APPROVE on a PR with auto-merge on posts COMMENT through the CLI", (t) => {
  const checkout = cleanCheckout(t);
  const reportPath = writeReport(t, APPROVE_REPORT);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, reportPath, "at-head"],
    responses: [
      prRead({ headRefOid: checkout.headSha, authorAssociation: "MEMBER", autoMerge: true }),
      review("COMMENTED", checkout.headSha),
      review("COMMENTED", checkout.headSha),
    ],
  });

  assert.ok(run.calls[1]?.includes("event=COMMENT"), `POST argv: ${JSON.stringify(run.calls[1])}`);
  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "downgraded APPROVE auto-merge"]);
  assert.equal(run.status, 0);
});

const UNTRUSTED = ["downgraded APPROVE untrusted-author"];

const TRUST_DECISION_ROWS = [
  ...["OWNER", "MEMBER", "COLLABORATOR"].map((association) => ({
    name: `an APPROVE by author association ${association} posts APPROVE`,
    facts: prFacts({ authorAssociation: association }),
    expected: { event: "APPROVE", notes: [] },
  })),
  ...["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "MANNEQUIN", "NONE"].map(
    (association) => ({
      name: `an APPROVE by author association ${association} posts COMMENT`,
      facts: prFacts({ authorAssociation: association }),
      expected: { event: "COMMENT", notes: UNTRUSTED },
    }),
  ),
  {
    name: "an APPROVE with no association posts COMMENT",
    facts: prFacts({}),
    expected: { event: "COMMENT", notes: UNTRUSTED },
  },
  {
    name: "an APPROVE with a null association posts COMMENT",
    facts: prFacts({ authorAssociation: null }),
    expected: { event: "COMMENT", notes: UNTRUSTED },
  },
  {
    name: "an association in another letter case posts COMMENT",
    facts: prFacts({ authorAssociation: "member" }),
    expected: { event: "COMMENT", notes: UNTRUSTED },
  },
  {
    name: "a REQUEST CHANGES by a NONE author stays REQUEST_CHANGES",
    facts: prFacts({ verdict: "REQUEST CHANGES", authorAssociation: "NONE" }),
    expected: { event: "REQUEST_CHANGES", notes: [] },
  },
  {
    name: "a REQUEST CHANGES with no association stays REQUEST_CHANGES",
    facts: prFacts({ verdict: "REQUEST CHANGES" }),
    expected: { event: "REQUEST_CHANGES", notes: [] },
  },
  {
    name: "a COMMENT by a NONE author posts COMMENT with no note",
    facts: prFacts({ verdict: "COMMENT", authorAssociation: "NONE" }),
    expected: { event: "COMMENT", notes: [] },
  },
  {
    name: "untrusted-author notes after self-authored and before auto-merge",
    facts: prFacts({ authorLogin: "me", authorAssociation: "NONE", autoMerge: true }),
    expected: {
      event: "COMMENT",
      notes: [
        "downgraded APPROVE self-authored",
        "downgraded APPROVE untrusted-author",
        "downgraded APPROVE auto-merge",
      ],
    },
  },
];

test("lowers APPROVE to COMMENT unless the PR author is an owner, member, or collaborator", async (t) => {
  for (const row of TRUST_DECISION_ROWS) {
    await t.test(row.name, () => {
      const result = decideReview(row.facts);
      assert.deepEqual({ event: result.event, notes: result.notes }, row.expected);
    });
  }
});

test("an APPROVE on a PR read with no authorAssociation posts COMMENT through the CLI", (t) => {
  const checkout = cleanCheckout(t);
  const reportPath = writeReport(t, APPROVE_REPORT);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, reportPath, "at-head"],
    responses: [
      prRead({ headRefOid: checkout.headSha, authorAssociation: undefined }),
      review("COMMENTED", checkout.headSha),
      review("COMMENTED", checkout.headSha),
    ],
  });

  assert.ok(run.calls[1]?.includes("event=COMMENT"), `POST argv: ${JSON.stringify(run.calls[1])}`);
  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, ...UNTRUSTED]);
  assert.equal(run.status, 0);
});
