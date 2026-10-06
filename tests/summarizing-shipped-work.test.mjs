// Fails when fetch-shipped-prs.sh stops exiting 64 on a wrong argument count or a
// malformed date, stops naming a missing tool, stops turning each OWNER into one
// --owner flag, splits a long range at the wrong 31-day boundaries, keeps going
// after a chunk reaches the 1000-result search cap, stops retrying a rate limit
// or retries any other failure, or changes the fields, Jira de-duplication, or
// comment stripping of its output lines.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/productivity/summarizing-shipped-work/scripts/fetch-shipped-prs.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command the script runs besides `gh`.
const TOOLS = ["jq", "date", "mktemp", "rm", "sleep"];
const JSON_FIELDS = "--limit 1000 --json repository,number,title,closedAt,url,body";

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "summarizing-shipped-work-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

// A PATH directory holding `tools` linked from the host and a fake `gh` that logs
// each call's arguments and answers from the `cases` script fragment, printing an
// empty result list for any call no case matches.
function fakeBin(dir, { tools = TOOLS, cases = "" } = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const gh = join(bin, "gh");
  writeFileSync(gh, `#!${BASH}\nprintf '%s\\n' "$*" >>'${log}'\ncase "$*" in\n${cases}\n  *) echo '[]' ;;\nesac\n`);
  chmodSync(gh, 0o755);
  return { bin, log };
}

function run(t, args, { tools, cases, env = {} } = {}) {
  const dir = scratch(t);
  const { bin, log } = fakeBin(dir, { tools, cases });
  const result = spawnSync(BASH, [SCRIPT, ...args], { encoding: "utf8", env: { PATH: bin, TMPDIR: dir, ...env } });
  const ghCalls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { result, ghCalls, dir };
}

// A gh case that prints `prs` as the search result for calls matching `pattern`.
function answer(dir, pattern, prs) {
  const file = join(dir, `answer-${pattern.replace(/[^0-9A-Za-z]/g, "")}.json`);
  writeFileSync(file, JSON.stringify(prs));
  return `  ${pattern}) printf '%s\\n' "$(<'${file}')" ;;`;
}

test("fetch-shipped-prs.sh exits 64 on a wrong argument count before any gh call", (t) => {
  for (const args of [[], ["2026-01-01"]]) {
    const { result, ghCalls } = run(t, args);
    assert.equal(result.status, 64, JSON.stringify(args));
    assert.match(result.stderr, /usage: .* START END \[OWNER\.\.\.\]/);
    assert.deepEqual(ghCalls, []);
  }
});

test("fetch-shipped-prs.sh refuses a malformed or impossible date, or START after END, with 64", (t) => {
  for (const [args, reason] of [
    [["2026-1-5", "2026-01-31"], /not a YYYY-MM-DD date: 2026-1-5/],
    [["2026-02-30", "2026-03-31"], /not a YYYY-MM-DD date: 2026-02-30/],
    [["2026-01-01", "last week"], /not a YYYY-MM-DD date: last week/],
    [["2026-03-01", "2026-02-01"], /START 2026-03-01 is after END 2026-02-01/],
  ]) {
    const { result, ghCalls } = run(t, args);
    assert.equal(result.status, 64, args.join(" "));
    assert.match(result.stderr, reason);
    assert.deepEqual(ghCalls, []);
  }
});

test("fetch-shipped-prs.sh exits 69 naming a missing jq before any gh call", (t) => {
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-01-07"], { tools: TOOLS.filter((tool) => tool !== "jq") });
  assert.equal(result.status, 69);
  assert.match(result.stderr, /missing required tool: jq/);
  assert.deepEqual(ghCalls, []);
});

test("fetch-shipped-prs.sh passes one --owner flag per OWNER, and none without owners", (t) => {
  const owned = run(t, ["2026-01-01", "2026-01-07", "acme", "widgets"]);
  assert.equal(owned.result.status, 0, owned.result.stderr);
  assert.deepEqual(owned.ghCalls, [
    `search prs --author=@me --merged-at=2026-01-01..2026-01-07 --owner=acme --owner=widgets ${JSON_FIELDS}`,
  ]);

  const everywhere = run(t, ["2026-01-01", "2026-01-07"]);
  assert.equal(everywhere.result.status, 0, everywhere.result.stderr);
  assert.deepEqual(everywhere.ghCalls, [`search prs --author=@me --merged-at=2026-01-01..2026-01-07 ${JSON_FIELDS}`]);
});

test("fetch-shipped-prs.sh splits a range over 31 days into inclusive 31-day chunks", (t) => {
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-03-15"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    ghCalls.map((call) => call.match(/--merged-at=(\S+)/)[1]),
    ["2026-01-01..2026-01-31", "2026-02-01..2026-03-03", "2026-03-04..2026-03-15"],
  );
});

test("fetch-shipped-prs.sh exits 1 with the cap error when a chunk returns 1000 results", (t) => {
  const dir = scratch(t);
  const full = Array.from({ length: 1000 }, (_, i) => ({ repository: { nameWithOwner: "acme/deploy-service" }, number: i + 1 }));
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-03-01"], {
    cases: answer(dir, '*"--merged-at=2026-01-01..2026-01-31"*', full),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2026-01-01\.\.2026-01-31 hit the 1000-result search cap/);
  assert.equal(ghCalls.length, 1, "no later chunk is searched");
  assert.equal(result.stdout, "");
});

test("fetch-shipped-prs.sh retries a rate-limited search and fails fast on any other error", (t) => {
  const dir = scratch(t);
  const limited = run(t, ["2026-01-01", "2026-01-07"], {
    env: { FETCH_SHIPPED_PRS_RETRY_SECONDS: "0" },
    cases: `  *) if [ -e '${dir}/limited' ]; then echo '[]'; else : >'${dir}/limited'; echo 'HTTP 403: You have exceeded a secondary rate limit.' >&2; exit 1; fi ;;`,
  });
  assert.equal(limited.result.status, 0, limited.result.stderr);
  assert.equal(limited.ghCalls.length, 2);
  assert.match(limited.result.stderr, /rate limited \(attempt 1 of 4\); retrying in 0s/);

  const denied = run(t, ["2026-01-01", "2026-01-07"], {
    cases: `  *) echo 'HTTP 401: Bad credentials' >&2; exit 1 ;;`,
  });
  assert.equal(denied.result.status, 1);
  assert.equal(denied.ghCalls.length, 1);
  assert.match(denied.result.stderr, /Bad credentials/);
  assert.match(denied.result.stderr, /search for PRs merged 2026-01-01\.\.2026-01-07 failed/);
});

test("fetch-shipped-prs.sh prints one line per PR with links de-duplicated and comments stripped", (t) => {
  const dir = scratch(t);
  const prs = [
    {
      repository: { nameWithOwner: "acme/deploy-service" },
      number: 781,
      title: "OPS-123: Step delayed rollouts one stage at a time",
      closedAt: "2026-01-05T18:30:00Z",
      url: "https://github.com/acme/deploy-service/pull/781",
      body: [
        "<!-- Describe the change.\nLink the ticket. -->Delayed rollouts now advance one stage at a time.",
        "",
        "Ticket: https://linear.app/acme/issue/OPS-123/step-rollouts",
        "Auto-linked: https://acme.atlassian.net/browse/OPS-123",
        "Related: https://acme.atlassian.net/browse/INFRA-9 and https://github.com/acme/web-console/issues/42",
      ].join("\n"),
    },
    {
      repository: { nameWithOwner: "acme/web-console" },
      number: 15,
      title: "Show the rollout stage",
      closedAt: "2026-01-06T09:00:00Z",
      url: "https://github.com/acme/web-console/pull/15",
      body: "word\n".repeat(200),
    },
  ];
  const { result } = run(t, ["2026-01-01", "2026-01-07"], { cases: answer(dir, "*", prs) });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    repo: "acme/deploy-service",
    number: 781,
    merged: "2026-01-05",
    title: "OPS-123: Step delayed rollouts one stage at a time",
    url: "https://github.com/acme/deploy-service/pull/781",
    issue_links: [
      "https://acme.atlassian.net/browse/INFRA-9",
      "https://github.com/acme/web-console/issues/42",
      "https://linear.app/acme/issue/OPS-123",
    ],
    title_ticket_keys: ["OPS-123"],
    body:
      "Delayed rollouts now advance one stage at a time. Ticket: https://linear.app/acme/issue/OPS-123/step-rollouts " +
      "Auto-linked: https://acme.atlassian.net/browse/OPS-123 Related: https://acme.atlassian.net/browse/INFRA-9 and " +
      "https://github.com/acme/web-console/issues/42",
  });
  assert.equal(lines[1].body, "word ".repeat(80));
  assert.deepEqual(lines[1].issue_links, []);
  assert.deepEqual(lines[1].title_ticket_keys, []);
});
