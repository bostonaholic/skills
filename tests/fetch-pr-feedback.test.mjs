// Fails when shared/scripts/fetch-pr-feedback.mjs drops a page of any connection (including a
// review thread's comments), duplicates a node across pages, prints anything after a failed or
// incomplete read, misreads its arguments, or calls gh without --hostname.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("shared/scripts/fetch-pr-feedback.mjs");
const PR_URL = "https://ghe.example.invalid/o/r/pull/7";
const HOST = "ghe.example.invalid";

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
process.stdout.write(response.stdout ?? "");
process.stderr.write(response.stderr ?? "");
process.exit(response.exitCode ?? 0);
`;

function run(t, args, responses = []) {
  const binDir = mkdtempSync(join(tmpdir(), "fpf-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "fpf-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  writeFileSync(join(binDir, "gh"), `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(join(binDir, "gh"), 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH}`,
      FAKE_GH_STATE: stateDir,
    },
  });
  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
}

const ok = (data) => ({ stdout: JSON.stringify({ data }) });
const page = (nodes, endCursor = null) => ({
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
  nodes,
});
const comment = (id) => ({ id, databaseId: 1, author: { login: "alice" }, body: `body ${id}` });
const thread = (id, comments) => ({ id, isResolved: false, path: "a.js", comments });

function firstResponse({ conversation = page([]), reviews = page([]), threads = page([]) } = {}) {
  return ok({
    viewer: { login: "me" },
    repository: {
      pullRequest: {
        url: PR_URL,
        state: "OPEN",
        headRefOid: "a".repeat(40),
        reviewDecision: null,
        autoMergeRequest: null,
        conversationComments: conversation,
        reviewSummaries: reviews,
        reviewThreads: threads,
      },
    },
  });
}

const followUp = (name, connection) => ok({ repository: { pullRequest: { [name]: connection } } });
const threadPage = (connection) => ok({ node: { comments: connection } });
const variable = (call, name) =>
  call.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

test("a complete read follows every page, including thread comments, and merges by id", (t) => {
  const result = run(
    t,
    [PR_URL],
    [
      firstResponse({
        conversation: page([comment("IC1")], "c1"),
        reviews: page([comment("PRR1")]),
        threads: page([thread("T1", page([comment("C1")], "t1c1"))], "t1"),
      }),
      followUp("conversationComments", page([comment("IC1"), comment("IC2")])),
      followUp("reviewThreads", page([thread("T2", page([comment("C3")]))])),
      threadPage(page([comment("C2")])),
    ],
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.pr, {
    host: HOST,
    owner: "o",
    repo: "r",
    number: 7,
    url: PR_URL,
    state: "OPEN",
    headRefOid: "a".repeat(40),
    reviewDecision: null,
    autoMergeEnabled: false,
  });
  assert.deepEqual(output.viewer, { login: "me" });
  assert.deepEqual(
    output.conversationComments.map((c) => c.id),
    ["IC1", "IC2"],
  );
  assert.deepEqual(
    output.reviewSummaries.map((r) => r.id),
    ["PRR1"],
  );
  assert.deepEqual(
    output.reviewThreads.map((th) => [th.id, th.comments.map((c) => c.id)]),
    [
      ["T1", ["C1", "C2"]],
      ["T2", ["C3"]],
    ],
  );
  assert.equal(result.calls.length, 4);
  for (const call of result.calls)
    assert.deepEqual(call.slice(0, 4), ["api", "graphql", "--hostname", HOST]);
  assert.equal(variable(result.calls[1], "after"), "c1");
  assert.equal(variable(result.calls[2], "after"), "t1");
  assert.equal(variable(result.calls[3], "id"), "T1");
  assert.equal(variable(result.calls[3], "after"), "t1c1");
});

test("a PR number resolves through gh pr view before the read", (t) => {
  const result = run(
    t,
    ["7", "--hostname", HOST],
    [{ stdout: JSON.stringify({ url: PR_URL }) }, firstResponse()],
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0], ["pr", "view", "7", "--json", "url"]);
  assert.equal(JSON.parse(result.stdout).pr.number, 7);
});

test("no argument resolves the current branch's PR", (t) => {
  const result = run(t, [], [{ stdout: JSON.stringify({ url: PR_URL }) }, firstResponse()]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0], ["pr", "view", "--json", "url"]);
});

test("--no-bodies selects no body or diffHunk field", (t) => {
  const result = run(t, [PR_URL, "--no-bodies"], [firstResponse()]);
  assert.equal(result.status, 0, result.stderr);
  const query = variable(result.calls[0], "query");
  assert.doesNotMatch(query, /\bbody\b|diffHunk/);
  assert.match(query, /reactionGroups/);
});

test("the default read selects bodies and diff hunks", (t) => {
  const result = run(t, [PR_URL], [firstResponse()]);
  assert.equal(result.status, 0, result.stderr);
  const query = variable(result.calls[0], "query");
  assert.match(query, /\bbody\b/);
  assert.match(query, /diffHunk/);
});

test("a failed or incomplete read exits 1 with nothing on stdout", async (t) => {
  const cases = {
    "a failing follow-up page": [
      firstResponse({ conversation: page([comment("IC1")], "c1") }),
      { stderr: "gh: Bad gateway (HTTP 502)\n", exitCode: 1 },
    ],
    "a failing thread-comment page": [
      firstResponse({ threads: page([thread("T1", page([comment("C1")], "t1c1"))]) }),
      { stderr: "gh: timeout\n", exitCode: 1 },
    ],
    "GraphQL errors": [{ stdout: JSON.stringify({ errors: [{ message: "Could not resolve" }] }) }],
    "output that is not JSON": [{ stdout: "<html>" }],
    "a malformed page": [firstResponse({ reviews: { nodes: [] } })],
    "a node without an id": [firstResponse({ reviews: page([{ body: "x" }]) })],
    "a page with no cursor": [
      firstResponse({ reviews: { pageInfo: { hasNextPage: true }, nodes: [] } }),
    ],
    "a missing pull request": [ok({ viewer: { login: "me" }, repository: { pullRequest: null } })],
    "a connection past the page cap": [
      firstResponse({ conversation: page([comment("IC0")], "p0") }),
      ...Array.from({ length: 9 }, (_, i) =>
        followUp("conversationComments", page([comment(`IC${i + 1}`)], `p${i + 1}`)),
      ),
    ],
  };
  for (const [name, responses] of Object.entries(cases)) {
    await t.test(name, (st) => {
      const result = run(st, [PR_URL], responses);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^fetch-pr-feedback\.mjs: /m);
      assert.equal(result.calls.length, responses.length);
    });
  }
});

test("a usage fault exits 2 before any read", async (t) => {
  for (const args of [
    ["abc"],
    ["--bogus"],
    ["7", "8"],
    ["--hostname"],
    ["7", "--hostname", "bad host"],
    ["https://github.com/o/r/issues/7"],
    [PR_URL, "--hostname", "github.com"],
  ]) {
    await t.test(args.join(" "), (st) => {
      const result = run(st, args);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.deepEqual(result.calls, []);
    });
  }
});

test("a PR gh pr view cannot resolve exits 2 and passes gh's stderr through", (t) => {
  const result = run(t, ["7"], [{ stderr: "no pull requests found\n", exitCode: 1 }]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^no pull requests found$/m);
});

test("a missing gh exits 127", (t) => {
  const emptyDir = mkdtempSync(join(tmpdir(), "fpf-no-gh-"));
  t.after(() => rmSync(emptyDir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [SCRIPT, PR_URL], {
    encoding: "utf8",
    env: { PATH: emptyDir },
  });
  assert.equal(result.status, 127);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^fetch-pr-feedback\.mjs: gh is not on PATH$/m);
});
