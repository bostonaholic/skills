// Fails when the README skill catalog or the generated site drifts from the tracked skills: a
// skill added or re-described without `npm run readme`, a site that drops a skill, an install
// command, or the extraction note, or a site that prints an argument hint without escaping it.
// The note and every install command come from scripts/catalog.mjs; this file holds no copy of
// them. The fixture cases run the real CLIs in a temporary repository built with `git init` plus
// `git add`, never a commit.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO = resolve(".");
const CATALOG = resolve("scripts/catalog.mjs");
const BUILD_SITE = resolve("scripts/build-site.mjs");
const START = "<!-- generated:start -->";
const END = "<!-- generated:end -->";
const COMMAND_EXPORTS = [
  "CLAUDE_MARKETPLACE_ADD",
  "CLAUDE_PLUGIN_INSTALL",
  "CLAUDE_MARKETPLACE_UPDATE",
  "CLAUDE_PLUGIN_UPDATE",
  "NPX_ADD_ALL",
  "NPX_ADD_SKILL",
  "NPX_UPDATE_SKILL",
];
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

async function catalogModule() {
  assert.ok(existsSync(CATALOG), `missing ${CATALOG}`);
  return import(pathToFileURL(CATALOG).href);
}

function escaped(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function trackedSkills() {
  return execFileSync("git", ["-C", REPO, "ls-files", "-z", "--", "skills/*/*/SKILL.md"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => path.split("/")[2])
    .sort();
}

function generatedBlock(readme) {
  assert.ok(readme.includes(START), `README.md has no ${START}`);
  assert.ok(readme.includes(END), `README.md has no ${END}`);
  return readme.slice(readme.indexOf(START) + START.length, readme.indexOf(END));
}

function buildSite(t, cwd) {
  assert.ok(existsSync(BUILD_SITE), `missing ${BUILD_SITE}`);
  const out = join(realpathSync(mkdtempSync(join(tmpdir(), "catalog-site-"))), "site");
  t.after(() => rmSync(dirname(out), { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [BUILD_SITE, out], { cwd, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return out;
}

function runCli(script, cwd, ...args) {
  assert.ok(existsSync(script), `missing ${script}`);
  const run = spawnSync(process.execPath, [script, ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

function fixtureRepo(t, files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "catalog-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const args of [["init", "-q"], ["add", "-A"]]) {
    const run = spawnSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return root;
}

function readmeEntry(root, name) {
  return readFileSync(join(root, "README.md"), "utf8")
    .split("\n")
    .find((line) => line.startsWith(`- **[${name}](./skills/engineering/${name}/SKILL.md)**:`));
}

const FIXTURE_README = `# Fixture\n\n${START}\n${END}\n`;

test("categorized inputs retain names, source paths, calls, and invocation labels in generated outputs", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "docs/CNAME": "example.test\n",
    "docs/style.css": "body { margin: 0; }\n",
    "skills/engineering/alpha/SKILL.md": "---\nname: alpha\ndescription: Fixture reader.\ndisable-model-invocation: true\n---\nCall the Skill tool with `beta`.\n",
    "skills/productivity/beta/SKILL.md": "---\nname: beta\ndescription: Fixture writer.\n---\n",
    "skills/deprecated/old/SKILL.md.disabled": "---\nname: old\ndescription: Archived fixture.\n---\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /### Engineering\n\n- \*\*\[alpha\]/);
  assert.match(readme, /### Productivity\n\n- \*\*\[beta\]/);
  assert.ok(readme.includes("./skills/productivity/beta/SKILL.md"));
  assert.ok(readme.includes("Explicit invocation only. Calls: `beta`."));
  assert.ok(!readme.includes("Archived fixture"));
  const html = readFileSync(join(buildSite(t, root), "index.html"), "utf8");
  assert.deepEqual([...html.matchAll(/<section id="([^"]+)"/g)].map(([, id]) => id), ["alpha", "beta"]);
  for (const dir of ["engineering/alpha", "productivity/beta"]) {
    assert.ok(html.includes(`https://github.com/bostonaholic/skills/tree/main/skills/${dir}`));
  }
  assert.ok(html.includes("Explicit invocation only."));
  assert.ok(html.includes("--skill beta"));
});

test("catalog rejects ambiguous command names across categories", (t) => {
  const entry = "---\nname: widget\ndescription: Fixture command.\n---\n";
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/widget/SKILL.md": entry,
    "skills/productivity/widget/SKILL.md": entry,
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /duplicate skill name "widget"/);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), FIXTURE_README);
});

// ---------------------------------------------------------------------------------------------
// The README

test("the committed README generated block equals renderReadme(loadCatalog())", async () => {
  const { loadCatalog, renderReadme } = await catalogModule();
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  assert.equal(generatedBlock(readme), renderReadme(await loadCatalog()));
});

// ---------------------------------------------------------------------------------------------
// The built site

test("the site has one section per tracked skill, keyed by the skill name", (t) => {
  const skills = trackedSkills();
  assert.ok(skills.length > 0, "found no tracked skills/*/*/SKILL.md");
  const html = readFileSync(join(buildSite(t, REPO), "index.html"), "utf8");
  const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id).sort();
  assert.deepEqual(sections, skills);
});

test("the site shows every install and update command exported by the catalog", async (t) => {
  const catalog = await catalogModule();
  assert.deepEqual(COMMAND_EXPORTS.filter((name) => typeof catalog[name] !== "string" || !catalog[name]), []);
  const html = readFileSync(join(buildSite(t, REPO), "index.html"), "utf8");
  assert.deepEqual(COMMAND_EXPORTS.filter((name) => !html.includes(escaped(catalog[name]))), []);
});

test("the site shows the subtitle exported by the catalog", async (t) => {
  const { LEDE } = await catalogModule();
  assert.ok(typeof LEDE === "string" && LEDE, "catalog exports no LEDE");
  const html = readFileSync(join(buildSite(t, REPO), "index.html"), "utf8");
  assert.ok(html.includes(escaped(LEDE)), "index.html lacks the subtitle");
});

test("the site carries the custom domain in CNAME", (t) => {
  const out = buildSite(t, REPO);
  assert.ok(existsSync(join(out, "CNAME")), "the site has no CNAME");
  assert.equal(readFileSync(join(out, "CNAME"), "utf8"), "skills.bostonaholic.dev\n");
});

test("the site HTML-escapes argument hints from its input", (t) => {
  const hint = '<value> & "quoted"';
  const root = fixtureRepo(t, {
    "docs/CNAME": "example.test\n",
    "docs/style.css": "body { margin: 0; }\n",
    "skills/engineering/widget/SKILL.md": `---\nname: widget\ndescription: Use for fixture checks.\nargument-hint: '${hint}'\n---\n\n# widget\n`,
  });
  const html = readFileSync(join(buildSite(t, root), "index.html"), "utf8");
  assert.ok(html.includes(escaped(hint)), "hint missing in escaped form");
  assert.ok(!html.includes(hint), "hint printed raw");
});

// ---------------------------------------------------------------------------------------------
// The CLIs on fixture repositories

test("a Skill tool call wrapped across a line break still yields a Calls entry", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/alpha/SKILL.md":
      "---\nname: alpha\ndescription: 'Use for fixture checks.'\n---\n\n# alpha\n\nWhen the report is ready, call the Skill tool\nwith `beta` to publish it.\n",
    "skills/engineering/beta/SKILL.md": "---\nname: beta\ndescription: 'Use for fixture publishing.'\n---\n\n# beta\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  assert.match(readmeEntry(root, "alpha") ?? "", / Calls: `beta`\.$/);
});

test("a skill without agents/openai.yaml is listed with the first sentence of its description", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/gamma/SKILL.md": "---\nname: gamma\ndescription: 'Use for fixture checks. Produces a fixture report.'\n---\n\n# gamma\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  assert.equal(readmeEntry(root, "gamma"), "- **[gamma](./skills/engineering/gamma/SKILL.md)**: Use for fixture checks.");
});

test("--write exits 1 naming the missing generated-block marker", (t) => {
  const root = fixtureRepo(t, {
    "README.md": `# Fixture\n\n${END}\n`,
    "skills/engineering/gamma/SKILL.md": "---\nname: gamma\ndescription: 'Use for fixture checks.'\n---\n\n# gamma\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(START), run.output);
});

test("catalog --check exits 1 naming a SKILL.md whose name differs from its directory", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/delta/SKILL.md": "---\nname: epsilon\ndescription: 'Use for fixture checks.'\n---\n\n# delta\n",
  });
  const run = runCli(CATALOG, root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/delta/SKILL.md"), run.output);
});

test("build-site exits 1 naming a SKILL.md whose name differs from its directory", (t) => {
  const root = fixtureRepo(t, {
    "docs/CNAME": "skills.bostonaholic.dev\n",
    "docs/style.css": "body { margin: 0; }\n",
    "skills/engineering/delta/SKILL.md": "---\nname: epsilon\ndescription: 'Use for fixture checks.'\n---\n\n# delta\n",
  });
  const run = runCli(BUILD_SITE, root, join(root, "site"));
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/delta/SKILL.md"), run.output);
});
