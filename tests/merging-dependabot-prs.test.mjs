// Fails when merging-dependabot-prs's scripts change how they parse version pairs, classify a
// semver level, read CI buckets, match security alerts, apply the decision table, order and
// render the plan, or gate, run, and verify a merge or rebase comment, or when an error path
// stops exiting with its documented code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

import {
  ciFromBuckets,
  classifyLevel,
  compareVersions,
  decide,
  decideRebaseOnly,
  ecosystemOf,
  matchAdvisories,
  maxLevel,
  parsePairs,
} from "../skills/engineering/merging-dependabot-prs/scripts/lib.mjs";
import {
  applyNotes,
  renderMerge,
} from "../skills/engineering/merging-dependabot-prs/scripts/render-plan.mjs";

const SCRIPTS = resolve("skills/engineering/merging-dependabot-prs/scripts");
const HEAD = "5e1c9a7d3b2f4e6a8c0d1f3e5a7b9c2d4e6f8a0b";
const OTHER_HEAD = "0000000000000000000000000000000000000000";

// --- pure functions -------------------------------------------------------------------------

test("classifyLevel covers patch, minor, major, 0.x minor, and unknown forms", () => {
  assert.equal(classifyLevel("2.4.1", "2.4.2"), "patch");
  assert.equal(classifyLevel("v2.4.1", "v2.5.0"), "minor");
  assert.equal(classifyLevel("2.4.1", "3.0.0"), "major");
  assert.equal(classifyLevel("0.4.1", "0.5.0"), "major");
  assert.equal(classifyLevel("0.4.1", "0.4.2"), "patch");
  assert.equal(classifyLevel("1", "1.1"), "minor");
  assert.equal(classifyLevel("1.0.0", "1.0.1-beta.1"), "unknown");
  assert.equal(classifyLevel("a1b2c3d", "e4f5a6b"), "unknown");
  assert.equal(classifyLevel("18-alpine", "20-alpine"), "unknown");
});

test("maxLevel takes the highest level and treats no pairs as unknown", () => {
  assert.equal(maxLevel([]), "unknown");
  assert.equal(maxLevel([{ level: "patch" }, { level: "minor" }]), "minor");
  assert.equal(maxLevel([{ level: "major" }, { level: "unknown" }]), "unknown");
});

test("parsePairs reads a single bump's title and body once, with its compare link", () => {
  const body = [
    "Bumps [@acme/retry](https://github.acme.invalid/acme/retry) from 2.4.1 to 2.4.2.",
    "<li>Bump lodash from 3.0.0 to 4.0.0 (#9)</li>",
    '<li>See full diff in <a href="https://github.acme.invalid/acme/retry/compare/v2.4.1...v2.4.2">compare view</a></li>',
  ].join("\n");
  assert.deepEqual(parsePairs("Bump @acme/retry from 2.4.1 to 2.4.2", body), [
    {
      pkg: "@acme/retry",
      from: "2.4.1",
      to: "2.4.2",
      level: "patch",
      grepSafe: true,
      upstreamRepo: "acme/retry",
      tag: "v2.4.2",
    },
  ]);
});

test("parsePairs reads each package of a grouped PR with its own section's compare link", () => {
  const body = [
    "Bumps the npm group with 2 updates: [a](https://x.invalid/o/a) and [b](https://x.invalid/o/b).",
    "",
    "Updates `a` from 1.0.0 to 1.1.0",
    "https://x.invalid/o/a/compare/v1.0.0...v1.1.0",
    "Updates `b` from 2.0.0 to 3.0.0",
    "https://x.invalid/o/b/compare/2.0.0...2.0.0;rm",
  ].join("\n");
  const pairs = parsePairs("Bump the npm group with 2 updates", body);
  assert.deepEqual(
    pairs.map(({ pkg, level, upstreamRepo, tag }) => ({ pkg, level, upstreamRepo, tag })),
    [
      { pkg: "a", level: "minor", upstreamRepo: "o/a", tag: "v1.1.0" },
      { pkg: "b", level: "major", upstreamRepo: "o/b", tag: null },
    ],
  );
});

test("parsePairs marks a package name outside the allowlist as not grep-safe", () => {
  const [pair] = parsePairs("chore(deps): bump org.acme:core from 1.0 to 1.1 in /api", "");
  assert.equal(pair.pkg, "org.acme:core");
  assert.equal(pair.grepSafe, false);
  assert.equal(pair.upstreamRepo, null);
});

test("ciFromBuckets maps gh's buckets", () => {
  assert.equal(ciFromBuckets([]), "none");
  assert.equal(ciFromBuckets(["pass", "skipping"]), "pass");
  assert.equal(ciFromBuckets(["pass", "pending"]), "pending");
  assert.equal(ciFromBuckets(["pending", "fail"]), "fail");
  assert.equal(ciFromBuckets(["cancel"]), "fail");
  assert.equal(ciFromBuckets(["weird"]), "fail");
});

test("compareVersions compares padded numeric versions and refuses others", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("v1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.0.0-rc1", "1.0.0"), null);
});

test("ecosystemOf maps Dependabot branch directories and leaves unknown ones null", () => {
  assert.equal(ecosystemOf("dependabot/npm_and_yarn/frontend/lodash-4.17.21"), "npm");
  assert.equal(ecosystemOf("dependabot/bundler/rails-7.1.0"), "rubygems");
  assert.equal(ecosystemOf("dependabot/docker/node-20"), null);
});

test("matchAdvisories needs ecosystem, package, and a patched version at or below the new one", () => {
  const pairs = [{ pkg: "Lodash", to: "4.17.21" }];
  const alert = (fields) => ({
    ecosystem: "npm",
    pkg: "lodash",
    ghsa: "GHSA-1",
    severity: "high",
    firstPatched: "4.17.21",
    ...fields,
  });
  assert.deepEqual(matchAdvisories([alert()], "npm", pairs), {
    security: "yes",
    advisories: [{ ghsa: "GHSA-1", severity: "high" }],
  });
  assert.equal(matchAdvisories([alert({ firstPatched: "4.17.22" })], "npm", pairs).security, "no");
  assert.equal(matchAdvisories([alert({ firstPatched: "" })], "npm", pairs).security, "no");
  assert.equal(matchAdvisories([alert({ ecosystem: "pip" })], "npm", pairs).security, "no");
  assert.equal(matchAdvisories(null, "npm", pairs).security, "unknown");
  assert.equal(matchAdvisories([alert()], null, pairs).security, "unknown");
});

const BASE_PR = {
  author: "app/dependabot",
  state: "OPEN",
  isDraft: false,
  editedBy: [],
  level: "patch",
  ci: "pass",
  mergeState: "CLEAN",
};

test("decide applies the table's rows in order", () => {
  const cases = [
    [{ author: "alice" }, "skip", "author is alice", false],
    [{ state: "CLOSED" }, "skip", "state is CLOSED", false],
    [{ isDraft: true }, "skip", "draft", false],
    [{ editedBy: ["alice"], level: "major" }, "skip", /^edited by alice; /, false],
    [{ level: "major", ci: "fail" }, "skip", /^level major/, false],
    [{ level: "unknown" }, "skip", /^level unknown/, false],
    [{ ci: "fail", mergeState: "BEHIND" }, "skip", "CI fail", true],
    [{ ci: "none" }, "skip", "CI none", true],
    [{ ci: "pending", mergeState: "BEHIND" }, "skip", /^CI pending/, true],
    [{ mergeState: "BEHIND" }, "rebase", /@dependabot rebase/, true],
    [{ mergeState: "DIRTY", level: "minor" }, "rebase", /@dependabot rebase/, true],
    [{ mergeState: "HAS_HOOKS" }, "merge", "", true],
    [{ mergeState: "BLOCKED" }, "skip", "merge state BLOCKED", true],
  ];
  for (const [fields, decision, reason, needsNotes] of cases) {
    const result = decide({ ...BASE_PR, ...fields });
    assert.equal(result.decision, decision, JSON.stringify(fields));
    if (reason instanceof RegExp) assert.match(result.reason, reason);
    else assert.equal(result.reason, reason);
    assert.equal(result.needsNotes, needsNotes, JSON.stringify(fields));
  }
});

test("decideRebaseOnly skips, needs-recreates, or rebases", () => {
  assert.equal(decideRebaseOnly({ ...BASE_PR, author: "bob" }).decision, "skip");
  assert.equal(decideRebaseOnly({ ...BASE_PR, state: "MERGED" }).reason, "state is MERGED");
  assert.equal(decideRebaseOnly({ ...BASE_PR, editedBy: ["bob"] }).decision, "needs-recreate");
  assert.deepEqual(decideRebaseOnly({ ...BASE_PR, isDraft: true }), {
    decision: "rebase",
    reason: "",
  });
});

test("applyNotes turns only a needsNotes PR with a note into a breaking skip", () => {
  const prs = [
    { number: 1, needsNotes: true, decision: "merge", reason: "" },
    { number: 2, needsNotes: false, decision: "skip", reason: "level major: x" },
    { number: 3, needsNotes: true, decision: "merge", reason: "" },
  ];
  const result = applyNotes(prs, { 1: "drops Node 16", 2: "removes foo()" });
  assert.deepEqual(
    result.map(({ decision, reason, note }) => [decision, reason, note]),
    [
      ["skip", "breaking: drops Node 16", "drops Node 16"],
      ["skip", "level major: x", "removes foo()"],
      ["merge", "", ""],
    ],
  );
});

test("renderMerge orders security, patch, minor, rest and escapes cells", () => {
  const pr = (number, fields) => ({
    number,
    title: `t${number}`,
    head: HEAD,
    pairs: [{ pkg: `p${number}`, from: "1.0.0", to: "1.0.1" }],
    level: "patch",
    ci: "pass",
    mergeState: "CLEAN",
    security: "no",
    advisories: [],
    note: "",
    decision: "merge",
    reason: "",
    ...fields,
  });
  const out = renderMerge([
    pr(9, { level: "major", decision: "skip", reason: "level major: a|b" }),
    pr(5, { level: "minor", decision: "rebase", reason: "comment @dependabot rebase" }),
    pr(7, {}),
    pr(8, {
      level: "minor",
      security: "yes",
      advisories: [{ ghsa: "GHSA-x", severity: "high" }],
    }),
    pr(3, {}),
  ]);
  const lines = out.split("\n");
  assert.equal(
    lines[0],
    "| PR | Update | Level | CI | Merge state | Security | Notes | Decision |",
  );
  assert.deepEqual(
    lines.slice(2, 7).map((line) => line.split(" | ")[0]),
    ["| #8", "| #3", "| #7", "| #5", "| #9"],
  );
  assert.match(lines[2], /\| yes GHSA-x \(high\) \|/);
  assert.match(lines[6], /\| skip: level major: a\\\|b \|$/);
  assert.match(lines[5], /\| rebase \|$/);
  assert.deepEqual(lines.slice(8), [
    `act 3 ${HEAD} merge`,
    `act 5 ${HEAD} rebase`,
    `act 7 ${HEAD} merge`,
    `act 8 ${HEAD} merge`,
  ]);
});

// --- CLI with a fake gh ---------------------------------------------------------------------

// A fake gh that logs each argv as one JSON line and answers from responses.json, keyed by the
// space-joined arguments. An unmatched call exits 1 so a test never passes on a missing stub.
const FAKE_GH = `
const { appendFileSync, readFileSync } = require("node:fs");
const dir = process.env.FAKE_GH_DIR;
const args = process.argv.slice(2);
appendFileSync(dir + "/calls.log", JSON.stringify(args) + "\\n");
const responses = JSON.parse(readFileSync(dir + "/responses.json", "utf8"));
const response = responses[args.join(" ")];
if (!response) { process.stderr.write("fake gh: unexpected call: " + args.join(" ") + "\\n"); process.exit(1); }
process.stdout.write(response.stdout ?? "");
process.stderr.write(response.stderr ?? "");
process.exit(response.status ?? 0);
`;

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "merging-dependabot-prs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(t, script, args, responses, { withGh = true } = {}) {
  const dir = scratch(t);
  if (withGh) {
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!${process.execPath}\n${FAKE_GH}`);
    chmodSync(gh, 0o755);
  }
  writeFileSync(join(dir, "responses.json"), JSON.stringify(responses));
  writeFileSync(join(dir, "calls.log"), "");
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    env: { PATH: withGh ? `${dir}${delimiter}${process.env.PATH}` : dir, FAKE_GH_DIR: dir },
  });
  const calls = readFileSync(join(dir, "calls.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { ...result, calls };
}

const ok = (value) => ({ stdout: typeof value === "string" ? value : JSON.stringify(value) });
const VIEW_FIELDS =
  "number,title,body,state,isDraft,author,headRefName,headRefOid,mergeStateStatus,commits";
const ALERTS =
  'api repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100 --paginate --jq .[] | [.dependency.package.ecosystem, .dependency.package.name, .security_advisory.ghsa_id, .security_advisory.severity, (.security_vulnerability.first_patched_version.identifier // "")] | @tsv';

function view(number, fields = {}) {
  return ok({
    number,
    title: "Bump @acme/retry from 2.4.1 to 2.4.2",
    body: "Bumps [@acme/retry](https://x.invalid/acme/retry) from 2.4.1 to 2.4.2.",
    state: "OPEN",
    isDraft: false,
    author: { login: "app/dependabot", is_bot: true },
    headRefName: "dependabot/npm_and_yarn/acme/retry-2.4.2",
    headRefOid: HEAD,
    mergeStateStatus: "CLEAN",
    commits: [{ authors: [{ login: "dependabot[bot]" }] }],
    ...fields,
  });
}

const SQUASH_OK = { "repo view --json squashMergeAllowed": ok({ squashMergeAllowed: true }) };

test("analyze.mjs prints the analysis for listed PRs in ascending order", (t) => {
  const result = run(t, "analyze.mjs", [], {
    ...SQUASH_OK,
    "pr list --author app/dependabot --state open --limit 200 --json number": ok([
      { number: 8 },
      { number: 7 },
    ]),
    [ALERTS]: ok("npm\t@acme/retry\tGHSA-abcd\thigh\t2.4.2\n"),
    [`pr view 7 --json ${VIEW_FIELDS}`]: view(7),
    "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
    [`pr view 8 --json ${VIEW_FIELDS}`]: view(8, {
      commits: [{ authors: [{ login: "dependabot[bot]" }, { login: "alice" }] }],
    }),
    "pr checks 8 --json bucket": { status: 8, stdout: '[{"bucket":"pending"}]' },
  });
  assert.equal(result.status, 0, result.stderr);
  const { mode, prs } = JSON.parse(result.stdout);
  assert.equal(mode, "merge");
  assert.deepEqual(
    prs.map((pr) => [pr.number, pr.level, pr.ci, pr.security, pr.decision, pr.needsNotes]),
    [
      [7, "patch", "pass", "yes", "merge", true],
      [8, "patch", "pending", "yes", "skip", false],
    ],
  );
  assert.deepEqual(prs[1].editedBy, ["alice"]);
  assert.equal(result.stderr, "");
});

test("analyze.mjs warns when the list hits its limit, before reading any PR", (t) => {
  // PR 1's read is left unstubbed so the run stops after the warning instead of
  // spawning 400 fake gh processes.
  const result = run(t, "analyze.mjs", [], {
    ...SQUASH_OK,
    "pr list --author app/dependabot --state open --limit 200 --json number": ok(
      Array.from({ length: 200 }, (_, i) => ({ number: i + 1 })),
    ),
    [ALERTS]: { status: 1, stderr: "gh: Forbidden (HTTP 403)\n" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /returned exactly 200 PRs; the list may be truncated/);
  assert.match(result.stderr, /gh pr view 1 exited 1/);
});

test("analyze.mjs reads a 403 alert response as security unknown", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    ...SQUASH_OK,
    [ALERTS]: { status: 1, stderr: "gh: Forbidden (HTTP 403)\n" },
    [`pr view 7 --json ${VIEW_FIELDS}`]: view(7),
    "pr checks 7 --json bucket": ok([]),
  });
  assert.equal(result.status, 0, result.stderr);
  const [pr] = JSON.parse(result.stdout).prs;
  assert.deepEqual([pr.security, pr.ci, pr.decision], ["unknown", "none", "skip"]);
});

test("analyze.mjs reads 'no checks reported' as CI none", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    ...SQUASH_OK,
    [ALERTS]: ok(""),
    [`pr view 7 --json ${VIEW_FIELDS}`]: view(7),
    "pr checks 7 --json bucket": {
      status: 1,
      stderr: "no checks reported on the 'dependabot/x' branch\n",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).prs[0].ci, "none");
});

test("analyze.mjs --rebase-only skips squash, alerts, and checks", (t) => {
  const result = run(t, "analyze.mjs", ["--rebase-only", "7", "9"], {
    [`pr view 7 --json ${VIEW_FIELDS}`]: view(7),
    [`pr view 9 --json ${VIEW_FIELDS}`]: view(9, { author: { login: "bob" } }),
  });
  assert.equal(result.status, 0, result.stderr);
  const { mode, prs } = JSON.parse(result.stdout);
  assert.equal(mode, "rebase-only");
  assert.deepEqual(
    prs.map((pr) => [pr.number, pr.decision, pr.level]),
    [
      [7, "rebase", null],
      [9, "skip", null],
    ],
  );
  assert.equal(result.calls.length, 2);
});

test("analyze.mjs exits 2 on a non-digit argument without calling gh", (t) => {
  const result = run(t, "analyze.mjs", ["7", "--dry-run"], {});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^analyze\.mjs: usage: /);
  assert.equal(result.calls.length, 0);
});

test("analyze.mjs exits 3 when squash merges are disallowed", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    "repo view --json squashMergeAllowed": ok({ squashMergeAllowed: false }),
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /disallows squash merges/);
  assert.equal(result.stdout, "");
});

test("analyze.mjs exits 1 on a failed alert read other than 403 or 404", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    ...SQUASH_OK,
    [ALERTS]: { status: 1, stderr: "gh: Server Error (HTTP 500)\n" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dependabot\/alerts exited 1/);
  assert.equal(result.stdout, "");
});

test("analyze.mjs exits 1 when a PR read fails", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    ...SQUASH_OK,
    [ALERTS]: { status: 1, stderr: "gh: Not Found (HTTP 404)\n" },
    [`pr view 7 --json ${VIEW_FIELDS}`]: { status: 1, stderr: "no pull requests found\n" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /gh pr view 7 exited 1: no pull requests found/);
});

test("analyze.mjs exits 1 on unrecognized checks output", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {
    ...SQUASH_OK,
    [ALERTS]: ok(""),
    [`pr view 7 --json ${VIEW_FIELDS}`]: view(7),
    "pr checks 7 --json bucket": { status: 1, stderr: "HTTP 502\n" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /gh pr checks 7 exited 1/);
});

test("analyze.mjs exits 127 when gh is missing", (t) => {
  const result = run(t, "analyze.mjs", ["7"], {}, { withGh: false });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /gh not found on PATH/);
});

function writeJson(t, value) {
  const path = join(scratch(t), "f.json");
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

const ANALYSIS = {
  mode: "merge",
  prs: [
    {
      number: 7,
      title: "Bump a",
      head: HEAD,
      pairs: [{ pkg: "a", from: "1.0.0", to: "1.0.1" }],
      level: "patch",
      ci: "pass",
      mergeState: "CLEAN",
      security: "no",
      advisories: [],
      decision: "merge",
      reason: "",
      needsNotes: true,
    },
  ],
};

test("render-plan.mjs applies a breaking note and drops the act line", (t) => {
  const result = spawnSync(
    process.execPath,
    [
      join(SCRIPTS, "render-plan.mjs"),
      writeJson(t, ANALYSIS),
      writeJson(t, { 7: "Drops Node 18" }),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "| PR | Update | Level | CI | Merge state | Security | Notes | Decision |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| #7 | a 1.0.0 to 1.0.1 | patch | pass | CLEAN | no | Drops Node 18 | skip: breaking: Drops Node 18 |",
      "",
      "",
    ].join("\n"),
  );
});

test("render-plan.mjs renders the rebase-only table", (t) => {
  const analysis = {
    mode: "rebase-only",
    prs: [
      { number: 9, title: "Bump b", head: HEAD, decision: "needs-recreate", reason: "edited" },
      { number: 4, title: "Bump a", head: HEAD, decision: "rebase", reason: "" },
    ],
  };
  const result = spawnSync(
    process.execPath,
    [join(SCRIPTS, "render-plan.mjs"), writeJson(t, analysis)],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "| PR | Title | Action | Reason |",
      "| --- | --- | --- | --- |",
      "| #4 | Bump a | rebase |  |",
      "| #9 | Bump b | needs-recreate | edited |",
      "",
      `act 4 ${HEAD} rebase`,
      "",
    ].join("\n"),
  );
});

test("render-plan.mjs exits 1 on malformed input and 2 on wrong usage", (t) => {
  const render = (...args) =>
    spawnSync(process.execPath, [join(SCRIPTS, "render-plan.mjs"), ...args], { encoding: "utf8" });
  assert.equal(render().status, 2);
  assert.equal(render("a", "b", "c").status, 2);
  const cases = [
    [[join(scratch(t), "missing.json")], /cannot read analysis/],
    [[writeJson(t, "{")], /is not JSON/],
    [[writeJson(t, [])], /analysis must be analyze\.mjs output/],
    [[writeJson(t, ANALYSIS), writeJson(t, [])], /notes must be a JSON object/],
    [[writeJson(t, ANALYSIS), writeJson(t, { 8: "x" })], /notes name PR 8/],
    [[writeJson(t, ANALYSIS), writeJson(t, { 7: 1 })], /note for PR 7 is not a string/],
  ];
  for (const [args, message] of cases) {
    const result = render(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.equal(result.stdout, "");
  }
});

const VIEW_7 = `pr view 7 --json ${VIEW_FIELDS}`;
const MERGE_7 = `pr merge 7 --squash --match-head-commit ${HEAD}`;
const COMMENT_7 = "pr comment 7 --body @dependabot rebase";
const COMMENT_URL = "https://x.invalid/acme/web/pull/7#issuecomment-1\n";

test("act.mjs merges, then reports the merge commit OID", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
    [VIEW_7]: view(7),
    "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
    [MERGE_7]: ok(""),
    "pr view 7 --json state,mergeCommit": ok({ state: "MERGED", mergeCommit: { oid: "abc123" } }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "merged abc123\n");
  assert.ok(result.calls.every((args) => !args.includes("--admin") && !args.includes("--auto")));
});

test("act.mjs fails when the merge does not leave the PR MERGED", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
    [VIEW_7]: view(7),
    "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
    [MERGE_7]: ok(""),
    "pr view 7 --json state,mergeCommit": ok({ state: "OPEN", mergeCommit: null }),
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "failed state is OPEN after merge\n");
});

test("act.mjs reports gh's message when the merge fails", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
    [VIEW_7]: view(7),
    "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
    [MERGE_7]: { status: 1, stderr: "Head branch was modified\n" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "failed Head branch was modified\n");
});

test("act.mjs comments @dependabot rebase on a BEHIND merge row", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
    [VIEW_7]: view(7, { mergeStateStatus: "BEHIND" }),
    [COMMENT_7]: ok(COMMENT_URL),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `rebase-requested ${COMMENT_URL}`);
});

test("act.mjs skips on pending CI, other merge states, and failed gate checks", (t) => {
  const cases = [
    [view(7), [{ bucket: "pending" }], "skipped CI pending; re-run"],
    [view(7), [{ bucket: "fail" }], "skipped merge state CLEAN, CI fail"],
    [
      view(7, { mergeStateStatus: "BLOCKED" }),
      [{ bucket: "pass" }],
      "skipped merge state BLOCKED, CI pass",
    ],
    [view(7, { state: "MERGED" }), [], "skipped state is MERGED"],
    [view(7, { author: { login: "alice" } }), [], "skipped author is alice"],
    [view(7, { headRefOid: OTHER_HEAD }), [], "skipped changed since approval; re-run"],
  ];
  for (const [pr, buckets, line] of cases) {
    const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
      [VIEW_7]: pr,
      "pr checks 7 --json bucket": { status: 0, stdout: JSON.stringify(buckets) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${line}\n`);
    assert.ok(result.calls.every((args) => args[1] !== "merge" && args[1] !== "comment"));
  }
});

test("act.mjs rebase posts only the literal comment after the gate passes", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "rebase"], {
    [VIEW_7]: view(7, { mergeStateStatus: "DIRTY" }),
    [COMMENT_7]: ok(COMMENT_URL),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `rebase-requested ${COMMENT_URL}`);
  assert.deepEqual(result.calls.at(-1), ["pr", "comment", "7", "--body", "@dependabot rebase"]);
});

test("act.mjs reports a failed comment", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "rebase"], {
    [VIEW_7]: view(7),
    [COMMENT_7]: { status: 1, stderr: "GraphQL: Resource not accessible\n" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "failed GraphQL: Resource not accessible\n");
});

test("act.mjs prints failed and exits 1 when the re-check read fails", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {
    [VIEW_7]: { status: 1, stderr: "HTTP 502\n" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^failed gh pr view 7 exited 1: HTTP 502\n$/);
});

test("act.mjs exits 2 on bad arguments without calling gh", (t) => {
  for (const args of [
    [],
    ["7", HEAD],
    ["7x", HEAD, "merge"],
    ["7", "abc", "merge"],
    ["7", HEAD, "close"],
  ]) {
    const result = run(t, "act.mjs", args, {});
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^act\.mjs: usage: /);
    assert.equal(result.calls.length, 0);
  }
});

test("act.mjs exits 127 when gh is missing", (t) => {
  const result = run(t, "act.mjs", ["7", HEAD, "merge"], {}, { withGh: false });
  assert.equal(result.status, 127);
  assert.equal(result.stdout, "");
});

function firstLines(text, count) {
  return text.split("\n").slice(0, count).join("\n");
}

function lastLine(text) {
  return text.replace(/\n$/, "").split("\n").at(-1);
}

test("Dependabot scripts forward gh's full stderr before their own line", async (t) => {
  await t.test("analyze.mjs gh repo view", (st) => {
    const result = run(st, "analyze.mjs", ["7"], {
      "repo view --json squashMergeAllowed": {
        status: 1,
        stderr: "gh-repo-sentinel line 1\ngh-repo-sentinel line 2\n",
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      firstLines(result.stderr, 3),
      "gh-repo-sentinel line 1\ngh-repo-sentinel line 2\nanalyze.mjs: gh repo view exited 1",
    );
    assert.match(lastLine(result.stderr), /^see /);
    assert.equal(result.stdout, "");
  });

  await t.test("analyze.mjs gh pr list", (st) => {
    const result = run(st, "analyze.mjs", [], {
      ...SQUASH_OK,
      "pr list --author app/dependabot --state open --limit 200 --json number": {
        status: 1,
        stderr: "gh-list-sentinel line 1\ngh-list-sentinel line 2\n",
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      firstLines(result.stderr, 3),
      "gh-list-sentinel line 1\ngh-list-sentinel line 2\nanalyze.mjs: gh pr list exited 1",
    );
    assert.match(lastLine(result.stderr), /^see /);
    assert.equal(result.stdout, "");
  });

  await t.test("analyze.mjs alerts failure other than HTTP 403 or 404", (st) => {
    const result = run(st, "analyze.mjs", ["7"], {
      ...SQUASH_OK,
      [ALERTS]: { status: 1, stderr: "gh: Server Error (HTTP 500)\ngh-alerts-sentinel\n" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      firstLines(result.stderr, 3),
      "gh: Server Error (HTTP 500)\ngh-alerts-sentinel\nanalyze.mjs: gh api dependabot/alerts exited 1",
    );
    assert.match(lastLine(result.stderr), /^see /);
    assert.equal(result.stdout, "");
  });

  await t.test("act.mjs failed comment", (st) => {
    const result = run(st, "act.mjs", ["7", HEAD, "rebase"], {
      [VIEW_7]: view(7),
      [COMMENT_7]: {
        status: 1,
        stderr: "GraphQL: Resource not accessible\ngh-comment-sentinel\n",
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "failed GraphQL: Resource not accessible\n");
    assert.equal(result.stderr, "GraphQL: Resource not accessible\ngh-comment-sentinel\n");
  });

  await t.test("act.mjs failed merge", (st) => {
    const result = run(st, "act.mjs", ["7", HEAD, "merge"], {
      [VIEW_7]: view(7),
      "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
      [MERGE_7]: { status: 1, stderr: "Head branch was modified\ngh-merge-sentinel\n" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "failed Head branch was modified\n");
    assert.equal(result.stderr, "Head branch was modified\ngh-merge-sentinel\n");
  });

  await t.test("act.mjs failed re-read after the merge", (st) => {
    const result = run(st, "act.mjs", ["7", HEAD, "merge"], {
      [VIEW_7]: view(7),
      "pr checks 7 --json bucket": ok([{ bucket: "pass" }]),
      [MERGE_7]: ok(""),
      "pr view 7 --json state,mergeCommit": { status: 1, stderr: "HTTP 502\ngh-reread-sentinel\n" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "failed merge ran but re-read failed: HTTP 502\n");
    assert.equal(result.stderr, "HTTP 502\ngh-reread-sentinel\n");
  });

  await t.test("lib.mjs ghJson failure reaching stderr through act.mjs", (st) => {
    const result = run(st, "act.mjs", ["7", HEAD, "merge"], {
      [VIEW_7]: { status: 1, stderr: "HTTP 502\ngh-view-sentinel\n" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      firstLines(result.stderr, 3),
      "HTTP 502\ngh-view-sentinel\nact.mjs: gh pr view 7 exited 1: HTTP 502",
    );
    assert.match(lastLine(result.stderr), /^see /);
    assert.equal(result.stdout, "failed gh pr view 7 exited 1: HTTP 502\n");
  });

  await t.test("gh text with no final newline still leaves the script's line its own", (st) => {
    const result = run(st, "analyze.mjs", ["7"], {
      "repo view --json squashMergeAllowed": { status: 1, stderr: "gh-no-newline-sentinel" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      firstLines(result.stderr, 2),
      "gh-no-newline-sentinel\nanalyze.mjs: gh repo view exited 1",
    );
  });

  await t.test(
    "a gh failure with empty stderr puts no blank line before the script's line",
    (st) => {
      const result = run(st, "analyze.mjs", ["7"], {
        "repo view --json squashMergeAllowed": { status: 1, stderr: "" },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(firstLines(result.stderr, 1), "analyze.mjs: gh repo view exited 1");
      assert.match(lastLine(result.stderr), /^see /);
    },
  );
});
