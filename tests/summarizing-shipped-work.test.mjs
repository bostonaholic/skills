// Fails when fetch-shipped-prs.sh stops exiting 64 on a wrong argument count or a
// malformed date, stops naming a missing tool, stops turning each OWNER into one
// --owner flag, splits a long range at the wrong 31-day boundaries, stops halving
// a range that reaches the 1000-result search cap or keeps going after a single
// day reaches it, stops retrying a rate limit or retries any other failure, or
// changes the fields, labels, title ticket links, Jira de-duplication, or comment
// stripping of its output lines; or when resolve-timeframe.mjs resolves a period
// token to the wrong dates or stops exiting 64 on a bad one.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
  writeFileSync(
    gh,
    `#!${BASH}\nprintf '%s\\n' "$*" >>'${log}'\ncase "$*" in\n${cases}\n  *) echo '[]' ;;\nesac\n`,
  );
  chmodSync(gh, 0o755);
  return { bin, log };
}

function run(t, args, { tools, cases, env = {} } = {}) {
  const dir = scratch(t);
  const { bin, log } = fakeBin(dir, { tools, cases });
  const result = spawnSync(BASH, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { PATH: bin, TMPDIR: dir, ...env },
  });
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
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-01-07"], {
    tools: TOOLS.filter((tool) => tool !== "jq"),
  });
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
  assert.deepEqual(everywhere.ghCalls, [
    `search prs --author=@me --merged-at=2026-01-01..2026-01-07 ${JSON_FIELDS}`,
  ]);
});

test("fetch-shipped-prs.sh splits a range over 31 days into inclusive 31-day chunks", (t) => {
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-03-15"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    ghCalls.map((call) => call.match(/--merged-at=(\S+)/)[1]),
    ["2026-01-01..2026-01-31", "2026-02-01..2026-03-03", "2026-03-04..2026-03-15"],
  );
});

function fullPage() {
  return Array.from({ length: 1000 }, (_, i) => ({
    repository: { nameWithOwner: "acme/deploy-service" },
    number: i + 1,
  }));
}

function pr(number, merged) {
  return {
    repository: { nameWithOwner: "acme/deploy-service" },
    number,
    title: `Change ${number}`,
    closedAt: `${merged}T12:00:00Z`,
    url: `https://github.com/acme/deploy-service/pull/${number}`,
    body: "",
  };
}

function mergedAt(calls) {
  return calls.map((call) => call.match(/--merged-at=(\S+)/)[1]);
}

test("fetch-shipped-prs.sh halves a range that reaches the search cap and prints the halves in order", (t) => {
  const dir = scratch(t);
  const { result, ghCalls } = run(t, ["2026-01-01", "2026-01-31"], {
    cases: [
      answer(dir, '*"--merged-at=2026-01-01..2026-01-31 "*', fullPage()),
      answer(dir, '*"--merged-at=2026-01-01..2026-01-16 "*', fullPage()),
      answer(dir, '*"--merged-at=2026-01-01..2026-01-08 "*', [pr(1, "2026-01-02")]),
      answer(dir, '*"--merged-at=2026-01-09..2026-01-16 "*', [pr(2, "2026-01-10")]),
      answer(dir, '*"--merged-at=2026-01-17..2026-01-31 "*', [pr(3, "2026-01-20")]),
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(mergedAt(ghCalls), [
    "2026-01-01..2026-01-31",
    "2026-01-01..2026-01-16",
    "2026-01-01..2026-01-08",
    "2026-01-09..2026-01-16",
    "2026-01-17..2026-01-31",
  ]);
  assert.match(
    result.stderr,
    /2026-01-01\.\.2026-01-31 hit the 1000-result search cap; splitting at 2026-01-16/,
  );
  assert.deepEqual(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).number),
    [1, 2, 3],
  );
});

test("fetch-shipped-prs.sh exits 1 when a single day reaches the search cap, searching nothing after it", (t) => {
  const dir = scratch(t);
  const { result, ghCalls } = run(t, ["2026-01-05", "2026-01-06"], {
    cases: [
      answer(dir, '*"--merged-at=2026-01-05..2026-01-06 "*', fullPage()),
      answer(dir, '*"--merged-at=2026-01-05..2026-01-05 "*', fullPage()),
    ].join("\n"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2026-01-05 alone hit the 1000-result search cap/);
  assert.deepEqual(mergedAt(ghCalls), ["2026-01-05..2026-01-06", "2026-01-05..2026-01-05"]);
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
      title: "WEB-7 Show the rollout stage",
      closedAt: "2026-01-06T09:00:00Z",
      url: "https://github.com/acme/web-console/pull/15",
      body: "word\n".repeat(200),
    },
  ];
  const { result } = run(t, ["2026-01-01", "2026-01-07"], { cases: answer(dir, "*", prs) });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    repo: "acme/deploy-service",
    number: 781,
    merged: "2026-01-05",
    title: "OPS-123: Step delayed rollouts one stage at a time",
    url: "https://github.com/acme/deploy-service/pull/781",
    pr_label: "deploy-service#781",
    issue_links: [
      "https://acme.atlassian.net/browse/INFRA-9",
      "https://github.com/acme/web-console/issues/42",
      "https://linear.app/acme/issue/OPS-123",
    ],
    title_ticket_links: { "OPS-123": "https://linear.app/acme/issue/OPS-123" },
    body:
      "Delayed rollouts now advance one stage at a time. Ticket: https://linear.app/acme/issue/OPS-123/step-rollouts " +
      "Auto-linked: https://acme.atlassian.net/browse/OPS-123 Related: https://acme.atlassian.net/browse/INFRA-9 and " +
      "https://github.com/acme/web-console/issues/42",
  });
  assert.equal(lines[1].body, "word ".repeat(80));
  assert.deepEqual(lines[1].issue_links, []);
  assert.equal(lines[1].pr_label, "web-console#15");
  assert.deepEqual(lines[1].title_ticket_links, { "WEB-7": null });
});

const TIMEFRAME = resolve(
  "skills/productivity/summarizing-shipped-work/scripts/resolve-timeframe.mjs",
);

function timeframe(...args) {
  return spawnSync(process.execPath, [TIMEFRAME, ...args], { encoding: "utf8" });
}

test("resolve-timeframe.mjs resolves each period token against --today", () => {
  // 2026-10-21 is a Wednesday.
  for (const [period, expected] of [
    ["this-week", "2026-10-19 2026-10-21"],
    ["last-week", "2026-10-12 2026-10-18"],
    ["this-month", "2026-10-01 2026-10-21"],
    ["last-month", "2026-09-01 2026-09-30"],
    ["this-quarter", "2026-10-01 2026-10-21"],
    ["last-quarter", "2026-07-01 2026-09-30"],
    ["2026-09", "2026-09-01 2026-09-30"],
    ["2026-10", "2026-10-01 2026-10-21"],
    ["2024-02", "2024-02-01 2024-02-29"],
    ["2026-Q3", "2026-07-01 2026-09-30"],
    ["2026-Q4", "2026-10-01 2026-10-21"],
    ["since:2026-08-15", "2026-08-15 2026-10-21"],
    ["2025-12-20..2026-01-10", "2025-12-20 2026-01-10"],
    ["2026-10-01..2026-12-31", "2026-10-01 2026-12-31"],
  ]) {
    const result = timeframe(period, "--today", "2026-10-21");
    assert.equal(result.status, 0, `${period}: ${result.stderr}`);
    assert.equal(result.stdout, `${expected}\n`, period);
  }
});

test("resolve-timeframe.mjs starts weeks on Monday and crosses year boundaries", () => {
  for (const [period, today, expected] of [
    ["this-week", "2026-10-19", "2026-10-19 2026-10-19"],
    ["this-week", "2026-10-25", "2026-10-19 2026-10-25"],
    ["last-week", "2026-10-25", "2026-10-12 2026-10-18"],
    ["last-week", "2026-01-01", "2025-12-22 2025-12-28"],
    ["last-month", "2026-01-15", "2025-12-01 2025-12-31"],
    ["last-quarter", "2026-02-15", "2025-10-01 2025-12-31"],
  ]) {
    const result = timeframe("--today", today, period);
    assert.equal(result.status, 0, `${period} on ${today}: ${result.stderr}`);
    assert.equal(result.stdout, `${expected}\n`, `${period} on ${today}`);
  }
});

test("resolve-timeframe.mjs exits 64 with a reason on a bad period or argument", () => {
  for (const [args, reason] of [
    [[], /usage: resolve-timeframe\.mjs PERIOD/],
    [["this-week", "last-week"], /usage: resolve-timeframe\.mjs PERIOD/],
    [["this-week", "--today"], /--today needs a YYYY-MM-DD date/],
    [["this-week", "--today", "2026-02-30"], /not a YYYY-MM-DD date: 2026-02-30/],
    [["next-week", "--today", "2026-10-21"], /unknown period: next-week/],
    [["2026-13", "--today", "2026-10-21"], /not a YYYY-MM month: 2026-13/],
    [["2026-Q5", "--today", "2026-10-21"], /unknown period: 2026-Q5/],
    [["since:2026-1-5", "--today", "2026-10-21"], /not a YYYY-MM-DD date: 2026-1-5/],
    [["since:2026-11-01", "--today", "2026-10-21"], /starts after today 2026-10-21/],
    [["2026-11", "--today", "2026-10-21"], /starts after today 2026-10-21/],
    [
      ["2026-03-01..2026-02-01", "--today", "2026-10-21"],
      /START 2026-03-01 is after END 2026-02-01/,
    ],
    [["2026-01-01..2026-02-01..2026-03-01", "--today", "2026-10-21"], /not a START\.\.END range/],
  ]) {
    const result = timeframe(...args);
    assert.equal(result.status, 64, args.join(" "));
    assert.match(result.stderr, reason, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
});
