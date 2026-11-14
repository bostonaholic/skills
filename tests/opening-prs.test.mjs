// Fails when opening-prs's preflight.mjs picks the wrong mode or lets a bad run through to the
// push: when it opens a second PR on a branch that already heads one, refreshes a PR other than
// the one named, accepts a repeated or multi-line `## Closing line`, misses an unreadable inputs
// file, the default branch, a gh stack layer, or a branch that heads two open PRs, or calls
// `gh pr create` or `gh pr edit` before it decides.
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
import { describe, it } from "node:test";

const PREFLIGHT = resolve("skills/engineering/opening-prs/scripts/preflight.mjs");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const GIT = spawnSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
const INPUTS = "pr-inputs-home.md";
const OTHER_BRANCH_PR = "https://github.com/acme/web/pull/5";

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "opening-prs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A PATH directory holding the host's git and a fake `gh` that logs each call. `gh repo view`
// names `main` as the default branch. `gh stack view --json` prints `stack` when given, else
// exits 1, as gh stack does on a branch in no stack. `gh pr list` with `--head <branch>` prints
// `openPrs`; without it, it also lists another branch's open PR, as GitHub does.
function fakeBin(dir, { branch, stack, openPrs }) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  symlinkSync(GIT, join(bin, "git"));
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const repoView = JSON.stringify({
    defaultBranchRef: { name: "main" },
    nameWithOwner: "acme/web",
    url: "https://github.com/acme/web",
  });
  const headPrs = JSON.stringify(openPrs.map((url) => ({ url })));
  const repoPrs = JSON.stringify([...openPrs, OTHER_BRANCH_PR].map((url) => ({ url })));
  const stackArm = stack
    ? `printf '%s\\n' '${JSON.stringify(stack)}'`
    : `echo 'failed to get current stack: not part of a stack' >&2; exit 1`;
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    [
      `#!${BASH}`,
      `printf '%s\\n' "$*" >>'${log}'`,
      `case "$*" in`,
      `  "repo view"*) printf '%s\\n' '${repoView}' ;;`,
      `  "stack view"*) ${stackArm} ;;`,
      `  "pr list"*"--head ${branch}"*|"pr list"*"--head=${branch}"*) printf '%s\\n' '${headPrs}' ;;`,
      `  "pr list"*) printf '%s\\n' '${repoPrs}' ;;`,
      `  *) exit 1 ;;`,
      `esac`,
      ``,
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
  return { bin, log };
}

// Runs preflight.mjs in a fresh repository on `row.branch`, with `row.inputs` written to the
// inputs path when the row has one.
function runPreflight(t, row) {
  const dir = scratch(t);
  const repo = join(dir, "repo");
  const env = { PATH: "", HOME: dir, GIT_CONFIG_NOSYSTEM: "1" };
  const init = spawnSync(GIT, ["init", "-q", "-b", row.branch, repo], { env, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  if (row.inputs !== undefined) writeFileSync(join(dir, INPUTS), row.inputs);
  const { bin, log } = fakeBin(dir, row);
  const result = spawnSync(process.execPath, [PREFLIGHT, ...row.args(dir)], {
    cwd: repo,
    encoding: "utf8",
    env: { ...env, PATH: bin },
  });
  return { result, ghCalls: readFileSync(log, "utf8") };
}

// The `KEY=VALUE` lines on stdout, as an object.
function decision(stdout) {
  return Object.fromEntries(
    stdout
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );
}

const VALID_INPUTS =
  "## Why\n\nCheckout needs a rate limit.\n\n## Closing line\n\nCloses #42\n\n## Verification\n\n- npm test passed.\n";

const DECIDE_ROWS = [
  {
    name: "no open PR for the branch decides open mode",
    branch: "feature/login",
    inputs: VALID_INPUTS,
    args: (dir) => ["--inputs", join(dir, INPUTS)],
    stack: null,
    openPrs: [],
    decision: { BRANCH: "feature/login", MODE: "open" },
  },
  {
    name: "one open PR for the branch decides refresh mode on its URL",
    branch: "feature/login",
    args: () => [],
    stack: null,
    openPrs: ["https://github.com/acme/web/pull/7"],
    decision: {
      BRANCH: "feature/login",
      MODE: "refresh",
      PR: "https://github.com/acme/web/pull/7",
    },
  },
  {
    // The lookup would list two PRs and refuse, so a refresh here shows that none ran.
    name: "a PR argument decides refresh mode on that PR with no lookup",
    branch: "feature/login",
    args: () => ["https://github.com/acme/web/pull/42"],
    stack: null,
    openPrs: ["https://github.com/acme/web/pull/7", "https://github.com/acme/web/pull/8"],
    decision: {
      BRANCH: "feature/login",
      MODE: "refresh",
      PR: "https://github.com/acme/web/pull/42",
    },
  },
];

const REFUSE_ROWS = [
  {
    name: "an unreadable --inputs path refuses and names the path",
    branch: "feature/login",
    args: (dir) => ["--inputs", join(dir, "missing-inputs.md")],
    stack: null,
    openPrs: [],
    refusal: /^refused: .*missing-inputs\.md/m,
  },
  {
    name: "two ## Closing line headings refuse and name the heading",
    branch: "feature/login",
    inputs:
      "## Closing line\n\nCloses #42\n\n## Why\n\nRate limit.\n\n## Closing line\n\nCloses #43\n",
    args: (dir) => ["--inputs", join(dir, INPUTS)],
    stack: null,
    openPrs: [],
    refusal: /^refused: .*## Closing line/m,
  },
  {
    name: "a ## Closing line with two non-empty lines refuses and names the heading",
    branch: "feature/login",
    inputs: "## Closing line\n\nCloses #42\nCloses #43\n\n## Why\n\nRate limit.\n",
    args: (dir) => ["--inputs", join(dir, INPUTS)],
    stack: null,
    openPrs: [],
    refusal: /^refused: .*## Closing line/m,
  },
  {
    name: "the default branch refuses and names it",
    branch: "main",
    args: () => [],
    stack: null,
    openPrs: [],
    refusal: /^refused: .*\bmain\b/m,
  },
  {
    name: "a gh stack layer refuses and names stacking-prs",
    branch: "invoices/api",
    args: () => [],
    stack: {
      trunk: "main",
      currentBranch: "invoices/api",
      branches: [
        { name: "invoices/schema", base: "main", isCurrent: false, isMerged: false },
        { name: "invoices/api", base: "invoices/schema", isCurrent: true, isMerged: false },
      ],
    },
    openPrs: [],
    refusal: /^refused: .*stacking-prs/m,
  },
  {
    name: "a branch that heads two open PRs refuses and lists both URLs",
    branch: "feature/login",
    args: () => [],
    stack: null,
    openPrs: ["https://github.com/acme/web/pull/7", "https://github.com/acme/web/pull/8"],
    refusal:
      /^refused: (?=[\s\S]*https:\/\/github\.com\/acme\/web\/pull\/7\b)(?=[\s\S]*https:\/\/github\.com\/acme\/web\/pull\/8\b)/m,
  },
];

describe("preflight decides open, refresh, or refuse before the push", () => {
  for (const row of DECIDE_ROWS) {
    it(row.name, (t) => {
      const { result, ghCalls } = runPreflight(t, row);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(decision(result.stdout), row.decision);
      assert.doesNotMatch(ghCalls, /^pr (create|edit)\b/m);
    });
  }

  for (const row of REFUSE_ROWS) {
    it(row.name, (t) => {
      const { result, ghCalls } = runPreflight(t, row);
      assert.equal(result.status, 1, `exit code; stderr:\n${result.stderr}`);
      assert.match(result.stderr, row.refusal);
      assert.equal(decision(result.stdout).MODE, undefined, `stdout:\n${result.stdout}`);
      assert.doesNotMatch(ghCalls, /^pr (create|edit)\b/m);
    });
  }
});
