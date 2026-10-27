// Fails when the Claude Code plugin manifest stops shipping exactly the tracked skills and agents, when its
// version drifts from package.json, when the marketplace stops pointing at this plugin from the
// repository root, or when the Cursor plugin manifest ships a different plugin than the Claude Code one. Skills are enumerated with `git ls-files`, so untracked directories never count.
// Also fails when root package.json declares a dependency or the root tracks a lockfile, because a
// plugin install of the repository root installs those packages for every user.
// Also fails when a tracked skill entrypoint sits outside the layouts in AGENTS.md rules 1 and 6:
// an unknown category, a nested SKILL.md, or an archived entrypoint not named SKILL.md.disabled.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const CURSOR_PLUGIN = ".cursor-plugin/plugin.json";

function readJson(path) {
  assert.ok(existsSync(path), `missing ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function trackedSkillPaths() {
  return execFileSync("git", ["ls-files", "-z", "--", "skills/*/*/SKILL.md"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => `./${path.slice(0, -"/SKILL.md".length)}`)
    .sort();
}

test("the plugin skills array lists every tracked skill once and nothing else", () => {
  const tracked = trackedSkillPaths();
  assert.ok(tracked.length > 0, "found no tracked skills/*/*/SKILL.md");
  const listed = readJson(PLUGIN).skills;
  assert.ok(Array.isArray(listed), `${PLUGIN} has no skills array`);
  assert.deepEqual([...listed].sort(), tracked);
});

test("the plugin agents array lists every tracked agent once and nothing else", () => {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "agents/*.md"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => /^agents\/[^/]+\.md$/.test(path))
    .map((path) => `./${path}`)
    .sort();
  assert.deepEqual([...(readJson(PLUGIN).agents ?? [])].sort(), tracked);
});

test("the plugin version equals the package.json version", () => {
  assert.equal(readJson(PLUGIN).version, readJson("package.json").version);
});

test("the plugin root declares no npm dependencies and tracks no lockfile", () => {
  const manifest = readJson("package.json");
  const declared = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ].filter((key) => key in manifest);
  const lockfiles = execFileSync(
    "git",
    ["ls-files", "-z", "--", "package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  assert.deepEqual({ declared, lockfiles }, { declared: [], lockfiles: [] });
});

test("the marketplace lists the plugin by its name with source ./", () => {
  const plugin = readJson(PLUGIN);
  assert.ok(plugin.name, `${PLUGIN} has no name`);
  const entries = (readJson(MARKETPLACE).plugins ?? []).map(({ name, source }) => ({
    name,
    source,
  }));
  assert.deepEqual(entries, [{ name: plugin.name, source: "./" }]);
});

test("the Cursor plugin ships the same name, version, skills, agents, and commands key as the Claude Code plugin", () => {
  const pick = ({ name, version, skills, agents, commands }) => ({
    name,
    version,
    skills,
    agents,
    commands,
  });
  assert.deepEqual(pick(readJson(CURSOR_PLUGIN)), pick(readJson(PLUGIN)));
});

test("every tracked skill entrypoint sits in an active or incubating category or is an archived SKILL.md.disabled", () => {
  const strays = execFileSync("git", ["ls-files", "-z", "--", "skills"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => /(?:^|\/)SKILL\.md(?:\.disabled)?$/.test(path))
    .filter(
      (path) =>
        !/^skills\/(engineering|productivity|incubating)\/[^/]+\/SKILL\.md$/.test(path) &&
        !/^skills\/deprecated\/[^/]+\/SKILL\.md\.disabled$/.test(path),
    );
  assert.deepEqual(
    strays,
    [],
    `AGENTS.md rules 1 and 6: a skill entrypoint is skills/engineering/<name>/SKILL.md, skills/productivity/<name>/SKILL.md, skills/incubating/<name>/SKILL.md, or skills/deprecated/<name>/SKILL.md.disabled; found ${strays.join(", ")}`,
  );
});
