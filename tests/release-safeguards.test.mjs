// Script integration tests use synthetic inputs, signed local Git repositories,
// a local bare remote, and a GitHub stub. No network release or merge occurs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { cutChangelog, nextVersion, releaseNotes, runtimeChanged, versionedTitle } from "../scripts/release.mjs";

const SOURCE = resolve(".");
const SCRIPTS = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const RULE = "# Fixture rule\n\nCurrent bytes.\n";
const COPY = "skills/engineering/widget/shared/rule.md";
const URL = "https://github.com/bostonaholic/skills";
const RELEASED = `# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n- Initial fixture release.\n\n[Unreleased]: ${URL}/compare/v0.1.0...HEAD\n[0.1.0]: ${URL}/releases/tag/v0.1.0\n`;
const keyDir = mkdtempSync(join(tmpdir(), "release-test-signing-"));
after(() => rmSync(keyDir, { recursive: true, force: true }));
const key = join(keyDir, "key");
execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
const signers = join(keyDir, "allowed-signers");
writeFileSync(signers, `fixture ${readFileSync(`${key}.pub`, "utf8")}`);

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(root, message = "fixture") {
  assert.equal(git(root, "config", "--get", "commit.gpgsign"), "true");
  git(root, "add", ".");
  git(root, "commit", "-S", "-m", message);
  const signature = execFileSync("git", ["log", "-1", "--show-signature"], { cwd: root, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(signature, /Good "git" signature/);
  git(root, "verify-commit", "HEAD");
  return git(root, "rev-parse", "HEAD");
}

function fixture(t, { bootstrap = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "release-fixture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, "repo");
  mkdirSync(root);
  git(root, "init", "-q", "--initial-branch=main");
  for (const [name, value] of Object.entries({ "user.name": "Fixture", "user.email": "fixture@example.test", "commit.gpgsign": "true", "tag.gpgSign": "true", "gpg.format": "ssh", "user.signingkey": key, "gpg.ssh.allowedSignersFile": signers })) {
    git(root, "config", name, value);
  }
  if (bootstrap) {
    write(root, "README.md", "Fixture repository.\n");
    commit(root);
    git(root, "branch", "base");
  }
  const files = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.1.0", private: true, scripts: SCRIPTS }),
    "package-lock.json": JSON.stringify({ name: "fixture", version: "0.1.0", lockfileVersion: 3, packages: { "": { name: "fixture", version: "0.1.0" } } }),
    ".claude-plugin/plugin.json": JSON.stringify({ name: "fixture", version: "0.1.0" }),
    ".cursor-plugin/plugin.json": JSON.stringify({ name: "fixture", version: "0.1.0" }),
    "CHANGELOG.md": bootstrap ? "# Changelog\n\n## [Unreleased]\n\n- Initial fixture release.\n" : RELEASED,
    "shared/rule.md": RULE,
    "skills/engineering/widget/SKILL.md": "Read [the fixture rule](shared/rule.md).\n",
    [COPY]: RULE,
  };
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  mkdirSync(join(root, "scripts"));
  for (const script of ["release.mjs", "sync-shared.mjs"]) copyFileSync(join(SOURCE, "scripts", script), join(root, "scripts", script));
  commit(root);
  if (!bootstrap) git(root, "branch", "base");
  const remote = join(dir, "remote.git");
  git(root, "init", "--bare", "-q", remote);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-u", "origin", "main");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const call = { args };
if (args[0] === "release") call.notes = fs.readFileSync(args[args.indexOf("--notes-file") + 1], "utf8");
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(call) + "\\n");
if (args[0] === "api") console.log(process.env.FAKE_RELEASE_EXISTS || "");
if (args[0] === "release" && process.env.FAKE_RELEASE_FAIL) process.exit(1);
`);
  chmodSync(join(bin, "gh"), 0o755);
  return { root, env: { ...ENV, PATH: `${bin}:${ENV.PATH}`, FAKE_GH_LOG: join(dir, "gh.log") } };
}

function run(f, script, args = [], env = {}) {
  const result = spawnSync("npm", ["run", script, "--", ...args], { cwd: f.root, env: { ...f.env, ...env }, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

function runtimeEdit(f) {
  write(f.root, "skills/engineering/widget/behavior.txt", "Changed fixture behavior.\n");
  write(f.root, "CHANGELOG.md", RELEASED.replace("## [Unreleased]", "## [Unreleased]\n\n- Changed fixture behavior."));
  commit(f.root);
}

function readJson(root, path) { return JSON.parse(readFileSync(join(root, path), "utf8")); }

test("version policy handles bootstrap, patch, minor, stable major, and rejects implicit 1.0", () => {
  assert.equal(nextVersion(null, "minor"), "0.1.0");
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(nextVersion("0.1.9", "minor"), "0.2.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  for (const [base, level] of [["0.9.0", "major"], ["01.2.3", "minor"], ["1.2.3-rc.1", "patch"], [null, "patch"]]) assert.throws(() => nextVersion(base, level));
});

test("changelog cutting preserves older releases and rejects empty notes", () => {
  const cut = cutChangelog(RELEASED.replace("## [Unreleased]", "## [Unreleased]\n\n- New capability."), "0.2.0", "0.1.0", "2026-10-02");
  assert.equal(releaseNotes(cut, "0.2.0"), "- New capability.\n");
  assert.equal(releaseNotes(cut, "0.1.0"), "- Initial fixture release.\n");
  assert.ok(cut.includes(`${URL}/compare/v0.1.0...v0.2.0`));
  assert.throws(() => cutChangelog(RELEASED, "0.2.0", "0.1.0", "2026-10-02"));
  assert.equal(versionedTitle("v0.1.0 feat: example", "0.2.0"), "v0.2.0 feat: example");
  assert.equal(versionedTitle("v0.1.0 chore: tooling", null), "chore: tooling");
});

test("runtime classification excludes archives and tooling and ignores manifest version-only edits", () => {
  const before = () => '{"name":"fixture","version":"0.1.0"}';
  const after = () => '{"name":"fixture","version":"0.2.0"}';
  assert.equal(runtimeChanged(["skills/deprecated/old/file", "scripts/release.mjs", "docs/versioning.md"], before, after), false);
  assert.equal(runtimeChanged([".claude-plugin/plugin.json"], before, after), false);
  assert.equal(runtimeChanged([".claude-plugin/plugin.json"], before, () => '{"name":"renamed","version":"0.2.0"}'), true);
  assert.equal(runtimeChanged([".cursor-plugin/plugin.json"], before, after), false);
  assert.equal(runtimeChanged([".cursor-plugin/plugin.json"], before, () => '{"name":"renamed","version":"0.2.0"}'), true);
  assert.equal(runtimeChanged(["skills/productivity/widget/file"], before, after), true);
  assert.equal(runtimeChanged(["agents/widget.md"], before, after), true);
});

test("manifest descriptions can be added, edited, or removed without a release", () => {
  for (const path of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".cursor-plugin/plugin.json"]) {
    const manifest = { name: "fixture" };
    if (path.endsWith("marketplace.json")) manifest.plugins = [{ name: "fixture", source: "./" }];
    const bare = JSON.stringify(manifest);
    manifest.description = "Original description";
    if (manifest.plugins) manifest.plugins[0].description = "Original plugin description";
    const original = JSON.stringify(manifest);
    manifest.description = "New description";
    if (manifest.plugins) manifest.plugins[0].description = "New plugin description";
    const updated = JSON.stringify(manifest);
    for (const [before, after] of [[bare, original], [original, updated], [updated, bare]]) {
      assert.equal(runtimeChanged([path], () => before, () => after), false, path);
    }
  }
});

test("description edits do not hide functional manifest changes", () => {
  const cases = [
    [".claude-plugin/plugin.json", { skills: ["./skills/engineering/widget"] }],
    [".claude-plugin/plugin.json", { mcpServers: { fixture: { command: "fixture", env: { description: "functional value" } } } }],
    [".claude-plugin/marketplace.json", { plugins: [{ name: "fixture", source: "./new" }] }],
  ];
  for (const [path, change] of cases) {
    const before = {
      name: "fixture", description: "Old", skills: ["./skills/engineering/old"],
      plugins: [{ name: "fixture", source: "./" }],
      mcpServers: { fixture: { command: "fixture", env: { description: "old functional value" } } },
    };
    const after = { ...before, ...change, description: "New" };
    assert.equal(runtimeChanged([path], () => JSON.stringify(before), () => JSON.stringify(after)), true, path);
  }
  for (const after of [null, '{"description":"New"}']) {
    const before = after === null ? '{"description":"Old"}' : null;
    assert.equal(runtimeChanged([".claude-plugin/plugin.json"], () => before, () => after), true);
  }
});

test("description-only changes preserve versions, notes, and the published signed tag", (t) => {
  const f = fixture(t);
  const marketplace = { name: "fixture", plugins: [{ name: "fixture", source: "./" }] };
  write(f.root, ".claude-plugin/marketplace.json", JSON.stringify(marketplace));
  commit(f.root);
  git(f.root, "branch", "-f", "base", "HEAD");
  assert.equal(run(f, "release:publish").status, 0);
  const tag = git(f.root, "rev-parse", "v0.1.0");
  const plugin = readJson(f.root, ".claude-plugin/plugin.json");
  plugin.description = "Personal engineering skills.";
  marketplace.description = plugin.description;
  marketplace.plugins[0].description = plugin.description;
  write(f.root, ".claude-plugin/plugin.json", JSON.stringify(plugin));
  write(f.root, ".claude-plugin/marketplace.json", JSON.stringify(marketplace));
  const notes = RELEASED.replace("## [Unreleased]", "## [Unreleased]\n\n- Update descriptions.");
  write(f.root, "CHANGELOG.md", notes);
  commit(f.root);
  const prepared = run(f, "release:prepare", ["minor", "base"]);
  assert.equal(prepared.status, 0, prepared.output);
  assert.match(prepared.output, /"runtime":false/);
  assert.equal(git(f.root, "status", "--porcelain"), "");
  assert.equal(readFileSync(join(f.root, "CHANGELOG.md"), "utf8"), notes);
  const checked = run(f, "release:check", ["base"]);
  assert.equal(checked.status, 0, checked.output);
  assert.match(checked.output, /"runtime":false/);
  const published = run(f, "release:publish", [], { FAKE_RELEASE_EXISTS: "v0.1.0" });
  assert.equal(published.status, 0, published.output);
  assert.match(published.output, /"released":false/);
  assert.equal(git(f.root, "tag", "--list"), "v0.1.0");
  assert.equal(git(f.root, "rev-parse", "v0.1.0"), tag);
});

test("preparation repairs copies, versions all manifests, and can be re-entered without a second bump", (t) => {
  const f = fixture(t);
  runtimeEdit(f);
  write(f.root, "shared/rule.md", RULE + "Updated.\n");
  commit(f.root);
  const result = run(f, "release:prepare", ["minor", "base"]);
  assert.equal(result.status, 0, result.output);
  assert.equal(readFileSync(join(f.root, COPY), "utf8"), RULE + "Updated.\n");
  for (const path of ["package.json", "package-lock.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"]) assert.equal(readJson(f.root, path).version, "0.2.0");
  assert.equal(readJson(f.root, "package-lock.json").packages[""].version, "0.2.0");
  commit(f.root, "chore(version): 0.2.0");
  const again = run(f, "release:prepare", ["minor", "base"]);
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /"alreadyPrepared":true/);
  assert.equal(git(f.root, "status", "--porcelain"), "");
  const check = run(f, "release:check", ["base"]);
  assert.equal(check.status, 0, check.output);
});

test("bootstrap stays unprefixed until land time and prepares 0.1.0", (t) => {
  const f = fixture(t, { bootstrap: true });
  const title = () => execFileSync(process.execPath, ["scripts/release.mjs", "title"], { cwd: f.root, env: { ...f.env, HEAD_SHA: "HEAD", BASE_SHA: "base", CURRENT_TITLE: "feat: initial skills" }, encoding: "utf8" }).trim();
  assert.equal(title(), "");
  assert.notEqual(run(f, "release:check", ["base"]).status, 0);
  const result = run(f, "release:prepare", ["minor", "base"]);
  assert.equal(result.status, 0, result.output);
  assert.equal(readJson(f.root, "package.json").version, "0.1.0");
  commit(f.root);
  assert.equal(title(), "v0.1.0 feat: initial skills");
  const again = run(f, "release:prepare", ["minor", "base"]);
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /"alreadyPrepared":true/);
});

test("development-only PRs need no bump and reject a version-only bump", (t) => {
  const f = fixture(t);
  write(f.root, "docs/example.md", "Development documentation.\n");
  commit(f.root);
  assert.equal(run(f, "release:prepare", ["minor", "base"]).status, 0);
  assert.equal(run(f, "release:check", ["base"]).status, 0);
  for (const path of ["package.json", "package-lock.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"]) {
    const manifest = readJson(f.root, path);
    manifest.version = "0.2.0";
    if (path === "package-lock.json") manifest.packages[""].version = "0.2.0";
    write(f.root, path, JSON.stringify(manifest));
  }
  commit(f.root);
  const invalid = run(f, "release:check", ["base"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.output, /development-only PR must not change the version/);
});

test("unbumped runtime changes and a branch behind its base cannot merge", (t) => {
  const f = fixture(t);
  runtimeEdit(f);
  const check = run(f, "release:check", ["base"]);
  assert.match(check.output, /Runtime changes require a version/);
  git(f.root, "branch", "-f", "base", "HEAD");
  git(f.root, "checkout", "--detach", "HEAD~1");
  assert.match(run(f, "release:prepare", ["minor", "base"]).output, /Behind base/);
});

test("missing canonical rules stop preparation before versions change", (t) => {
  const f = fixture(t);
  runtimeEdit(f);
  rmSync(join(f.root, "shared/rule.md"));
  commit(f.root);
  const result = run(f, "release:prepare", ["minor", "base"]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /no canonical file/);
  assert.equal(readJson(f.root, "package.json").version, "0.1.0");
});

for (const problem of ["stale", "missing", "extra"]) {
  test(`publication refuses ${problem} copies before creating tags or calling GitHub`, (t) => {
    const f = fixture(t);
    if (problem === "stale") write(f.root, COPY, "Stale.\n");
    if (problem === "missing") rmSync(join(f.root, COPY));
    if (problem === "extra") write(f.root, "skills/engineering/widget/shared/extra.md", "Extra.\n");
    commit(f.root);
    const result = run(f, "release:publish");
    assert.notEqual(result.status, 0);
    assert.ok(result.output.includes(`${problem}:`), result.output);
    assert.equal(git(f.root, "tag", "--list"), "");
    assert.equal(existsSync(f.env.FAKE_GH_LOG), false);
    assert.equal(git(f.root, "status", "--porcelain"), "");
  });
}

test("publication creates a verified signed tag, publishes its notes, and is idempotent for dev-only merges", (t) => {
  const f = fixture(t);
  const result = run(f, "release:publish");
  assert.equal(result.status, 0, result.output);
  git(f.root, "tag", "-v", "v0.1.0");
  const tag = git(f.root, "rev-parse", "v0.1.0");
  const calls = readFileSync(f.env.FAKE_GH_LOG, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(calls.at(-1).notes, "- Initial fixture release.\n");
  assert.ok(calls.at(-1).args.includes("--verify-tag"));
  write(f.root, "docs/new.md", "Dev change.\n");
  commit(f.root);
  const again = run(f, "release:publish", [], { FAKE_RELEASE_EXISTS: "v0.1.0" });
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /"released":false/);
  assert.equal(git(f.root, "rev-parse", "v0.1.0"), tag);
  runtimeEdit(f);
  const stale = run(f, "release:publish");
  assert.notEqual(stale.status, 0);
  assert.match(stale.output, /Runtime changed since v0.1.0/);
});

test("publication recovers after release creation fails without replacing the signed tag", (t) => {
  const f = fixture(t);
  assert.notEqual(run(f, "release:publish", [], { FAKE_RELEASE_FAIL: "1" }).status, 0);
  const tag = git(f.root, "rev-parse", "v0.1.0");
  const retry = run(f, "release:publish");
  assert.equal(retry.status, 0, retry.output);
  assert.equal(git(f.root, "rev-parse", "v0.1.0"), tag);
  git(f.root, "tag", "-v", "v0.1.0");
});

test("publication rejects a signed tag on unrelated history without calling GitHub", (t) => {
  const f = fixture(t);
  const original = git(f.root, "rev-parse", "HEAD");
  write(f.root, "future.txt", "Different history.\n");
  commit(f.root);
  git(f.root, "tag", "-s", "v0.1.0", "-m", "Fixture collision");
  git(f.root, "tag", "-v", "v0.1.0");
  git(f.root, "checkout", "--detach", original);
  const result = run(f, "release:publish");
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Tag collision/);
  assert.equal(existsSync(f.env.FAKE_GH_LOG), false);
});

test("publication refuses an existing tag whose signature cannot be verified", (t) => {
  const f = fixture(t);
  git(f.root, "tag", "-s", "v0.1.0", "-m", "Fixture release");
  git(f.root, "tag", "-v", "v0.1.0");
  git(f.root, "config", "gpg.ssh.allowedSignersFile", join(dirname(f.root), "missing-signers"));
  const result = run(f, "release:publish");
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(f.env.FAKE_GH_LOG), false);
  assert.equal(git(f.root, "ls-remote", "--tags", "origin"), "");
});

test("publication refuses missing release notes and inconsistent versions", (t) => {
  const f = fixture(t, { bootstrap: true });
  assert.notEqual(run(f, "release:publish").status, 0);
  assert.equal(git(f.root, "tag", "--list"), "");
  write(f.root, "CHANGELOG.md", RELEASED);
  const pkg = readJson(f.root, "package.json");
  pkg.version = "0.2.0";
  write(f.root, "package.json", JSON.stringify(pkg));
  commit(f.root);
  assert.match(run(f, "release:publish").output, /version differs/);
  assert.equal(git(f.root, "tag", "--list"), "");
});

test("title synchronization uses the fork point when the base advances", (t) => {
  const f = fixture(t);
  git(f.root, "branch", "topic");
  runtimeEdit(f);
  assert.equal(run(f, "release:prepare", ["minor", "base"]).status, 0);
  commit(f.root);
  const advancedBase = git(f.root, "rev-parse", "HEAD");
  git(f.root, "checkout", "topic");
  write(f.root, "docs/topic.md", "Topic documentation.\n");
  commit(f.root);
  const title = execFileSync(process.execPath, ["scripts/release.mjs", "title"], { cwd: f.root, env: { ...f.env, HEAD_SHA: "HEAD", BASE_SHA: advancedBase, CURRENT_TITLE: "docs: example" }, encoding: "utf8" }).trim();
  assert.equal(title, "");
});
