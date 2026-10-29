// Fails when the README skill catalog or the generated site drifts from the tracked skills: a
// skill added or re-described without `npm run readme`, a README or site that drops the Claude
// Code install command, a site that drops a skill, the install prompt, or the extraction note,
// or a site that prints an argument hint without escaping it. The note, the Claude Code install
// command, and the install prompt come from scripts/catalog.mjs; this file holds no copy of
// them. The fixture cases run the real CLIs in a temporary repository built with `git init` plus
// `git add`, never a commit.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO = resolve(".");
const CATALOG = resolve("scripts/catalog.mjs");
const BUILD_SITE = resolve("scripts/build-site.mjs");
const START = "<!-- generated:start -->";
const END = "<!-- generated:end -->";
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

async function catalogModule() {
  assert.ok(existsSync(CATALOG), `missing ${CATALOG}`);
  return import(pathToFileURL(CATALOG).href);
}

function escaped(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function trackedSkills() {
  return execFileSync("git", ["-C", REPO, "ls-files", "-z", "--", "skills/*/*/SKILL.md"], {
    encoding: "utf8",
  })
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
  const run = spawnSync(process.execPath, [BUILD_SITE, out], {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return out;
}

function runCli(script, cwd, ...args) {
  assert.ok(existsSync(script), `missing ${script}`);
  const run = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

function fixtureRepo(t, files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "catalog-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
  ]) {
    const run = spawnSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return root;
}

function readmeRow(root, category, name) {
  const prefix = `| [\`${name}\`](./skills/${category}/${name}/SKILL.md) `;
  const row = readFileSync(join(root, "README.md"), "utf8")
    .split("\n")
    .find((line) => line.startsWith(prefix));
  assert.ok(row, `README.md has no table row starting ${prefix}`);
  return row;
}

// Splits a table row where GFM does, on a pipe preceded by an even number of backslashes, and
// trims each cell.
function rowCells(row) {
  return row
    .split(/(?<=(?:^|[^\\])(?:\\\\)*)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());
}

const FIXTURE_README = `# Fixture\n\n${START}\n${END}\n`;

test("categorized inputs retain names, source paths, calls, and invocation labels in generated outputs", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "docs/CNAME": "example.test\n",
    "docs/style.css": "body { margin: 0; }\n",
    "docs/copy-code.js": "",
    "skills/engineering/alpha/SKILL.md":
      "---\nname: alpha\ndescription: Fixture reader.\ndisable-model-invocation: true\n---\nCall the Skill tool with `beta`.\n",
    "skills/productivity/beta/SKILL.md":
      '---\nname: beta\ndescription: Fixture writer. Use when the user says "run beta".\n---\n',
    "skills/deprecated/old/SKILL.md.disabled":
      '---\nname: old\ndescription: Archived fixture. Use when the user says "run old".\n---\n',
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /### Engineering\n\n\| Skill +\| Say +\| What it does +\|/);
  assert.match(readme, /### Productivity\n\n\| Skill +\| Say +\| What it does +\|/);
  assert.ok(readme.includes("./skills/productivity/beta/SKILL.md"));
  assert.equal(rowCells(readmeRow(root, "engineering", "alpha"))[1], "`/alpha`");
  assert.equal(rowCells(readmeRow(root, "productivity", "beta"))[1], '"run beta"');
  assert.match(readme, /^- `alpha` calls `beta`\.$/m);
  assert.ok(!readme.includes("Explicit invocation only"), readme);
  assert.ok(!readme.includes("Archived fixture"));
  const html = readFileSync(join(buildSite(t, root), "index.html"), "utf8");
  assert.deepEqual(
    [...html.matchAll(/<section id="([^"]+)"/g)].map(([, id]) => id),
    ["alpha", "beta"],
  );
  for (const dir of ["engineering/alpha", "productivity/beta"]) {
    assert.ok(html.includes(`https://github.com/bostonaholic/skills/tree/main/skills/${dir}`));
  }
  assert.ok(html.includes("Explicit invocation only."));
  assert.ok(html.includes("--skill beta"));
});

test("catalog rejects ambiguous command names across categories", (t) => {
  const entry =
    '---\nname: widget\ndescription: Fixture command. Use when the user says "run widget".\n---\n';
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

test("the README Install section shows the Claude Code install command in a text fence", async () => {
  const { CLAUDE_CODE_INSTALL_COMMAND, loadCatalog, renderReadme } = await catalogModule();
  const block = renderReadme(await loadCatalog());
  const expected = ["```text", CLAUDE_CODE_INSTALL_COMMAND, "```"].join("\n");
  assert.ok(
    block.includes(expected),
    `README Install section lacks the Claude Code install command in a text fence:\n${expected}`,
  );
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

test("the site shows the Claude Code install command, the install prompt, and links an installation doc that exists", async (t) => {
  const { CLAUDE_CODE_INSTALL_COMMAND, INSTALL_DOC, INSTALL_PROMPT, INSTALL_PROMPT_LABEL } =
    await catalogModule();
  assert.ok(existsSync(join(REPO, INSTALL_DOC)), `missing ${INSTALL_DOC}`);
  const html = readFileSync(join(buildSite(t, REPO), "index.html"), "utf8");
  for (const text of [
    CLAUDE_CODE_INSTALL_COMMAND,
    INSTALL_PROMPT_LABEL,
    INSTALL_PROMPT,
    `/blob/main/${INSTALL_DOC}`,
  ]) {
    assert.ok(html.includes(escaped(text)), `index.html lacks ${text}`);
  }
  assert.ok(
    html.includes(`<pre><code>${escaped(CLAUDE_CODE_INSTALL_COMMAND)}</code></pre>`),
    `index.html lacks a <pre><code> block holding ${CLAUDE_CODE_INSTALL_COMMAND}`,
  );
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
    "docs/copy-code.js": "",
    "skills/engineering/widget/SKILL.md": `---\nname: widget\ndescription: Use for fixture checks. Use when the user says "run widget".\nargument-hint: '${hint}'\n---\n\n# widget\n`,
  });
  const html = readFileSync(join(buildSite(t, root), "index.html"), "utf8");
  assert.ok(html.includes(escaped(hint)), "hint missing in escaped form");
  assert.ok(!html.includes(hint), "hint printed raw");
});

// ---------------------------------------------------------------------------------------------
// The CLIs on fixture repositories

test("a Skill tool call wrapped across a line break still yields a Skill calls entry", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/alpha/SKILL.md":
      "---\nname: alpha\ndescription: 'Use for fixture checks. Use when the user says \"run alpha\".'\n---\n\n# alpha\n\nWhen the report is ready, call the Skill tool\nwith `beta` to publish it.\n",
    "skills/engineering/beta/SKILL.md":
      "---\nname: beta\ndescription: 'Use for fixture publishing. Use when the user says \"run beta\".'\n---\n\n# beta\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^- `alpha` calls `beta`\.$/m);
});

test("a skill without agents/openai.yaml is listed with the first sentence of its description", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/gamma/SKILL.md":
      "---\nname: gamma\ndescription: 'Use for fixture checks. Produces a fixture report. Use when the user says \"run gamma\".'\n---\n\n# gamma\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const table = [
    "| Skill                                          | Say         | What it does            |",
    "| ---------------------------------------------- | ----------- | ----------------------- |",
    '| [`gamma`](./skills/engineering/gamma/SKILL.md) | "run gamma" | Use for fixture checks. |',
  ].join("\n");
  assert.ok(readme.includes(table), `README.md lacks the padded gamma table:\n${readme}`);
  assert.ok(!readme.includes("### Skill calls"), readme);
  assert.ok(!readme.includes("### Productivity"), readme);
});

test("a column header wider than every body cell sets that column's width", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/delta/SKILL.md":
      "---\nname: delta\ndescription: 'Use it. Use when the user says \"run delta\".'\n---\n\n# delta\n",
    "skills/engineering/epsilon/SKILL.md":
      "---\nname: epsilon\ndescription: 'Use for a. Use when the user says \"run epsilon\".'\n---\n\n# epsilon\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 0, run.output);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const table = [
    "| Skill                                              | Say           | What it does |",
    "| -------------------------------------------------- | ------------- | ------------ |",
    '| [`delta`](./skills/engineering/delta/SKILL.md)     | "run delta"   | Use it.      |',
    '| [`epsilon`](./skills/engineering/epsilon/SKILL.md) | "run epsilon" | Use for a.   |',
  ].join("\n");
  assert.ok(readme.includes(table), `README.md lacks the header-widest table:\n${readme}`);
});

// Each case: a label, the raw short_description YAML value, and the expected What it does cell.
// The newline case holds a backslash and `n`, which unquote() turns into a newline via JSON.parse.
const CELL_ESCAPE_CASES = [
  { label: "pipe", value: '"Split a | b"', cell: "Split a \\| b." },
  { label: "newline", value: '"Line one\\nline two"', cell: "Line one line two." },
  { label: "backslash pipe", value: '"Split a \\\\| b"', cell: "Split a \\\\\\| b." },
];

for (const { label, value, cell } of CELL_ESCAPE_CASES) {
  test(`a pipe or newline in a short_description stays inside its table cell (${label})`, (t) => {
    const root = fixtureRepo(t, {
      "README.md": FIXTURE_README,
      "skills/engineering/pipe/SKILL.md":
        "---\nname: pipe\ndescription: 'Use for fixture checks. Use when the user says \"run pipe\".'\n---\n\n# pipe\n",
      "skills/engineering/pipe/agents/openai.yaml": `interface:\n  short_description: ${value}\n`,
    });
    const run = runCli(CATALOG, root, "--write");
    assert.equal(run.status, 0, run.output);
    const row = readmeRow(root, "engineering", "pipe");
    assert.deepEqual(rowCells(row), [
      "[`pipe`](./skills/engineering/pipe/SKILL.md)",
      '"run pipe"',
      cell,
    ]);
    const header = readFileSync(join(root, "README.md"), "utf8")
      .split("\n")
      .find((line) => line.startsWith("| Skill"));
    assert.equal(row.length, header?.length, `row and header widths differ:\n${header}\n${row}`);
  });
}

test("--write exits 1 naming the missing generated-block marker", (t) => {
  const root = fixtureRepo(t, {
    "README.md": `# Fixture\n\n${END}\n`,
    "skills/engineering/gamma/SKILL.md":
      "---\nname: gamma\ndescription: 'Use for fixture checks. Use when the user says \"run gamma\".'\n---\n\n# gamma\n",
  });
  const run = runCli(CATALOG, root, "--write");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(START), run.output);
});

test("catalog --check exits 1 naming a SKILL.md whose name differs from its directory", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/delta/SKILL.md":
      "---\nname: epsilon\ndescription: 'Use for fixture checks. Use when the user says \"run epsilon\".'\n---\n\n# delta\n",
  });
  const run = runCli(CATALOG, root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/delta/SKILL.md"), run.output);
});

const MISSING_PHRASE_CASES = [
  { label: "no phrase", description: "'Use for fixture checks.'" },
  {
    label: "phrase outside Use when the user says",
    description: `'Use for fixture checks when the user says "run gamma".'`,
  },
];

for (const { label, description } of MISSING_PHRASE_CASES) {
  test(`catalog --check exits 1 naming a model-invoked SKILL.md without Use when the user says (${label})`, (t) => {
    const root = fixtureRepo(t, {
      "README.md": FIXTURE_README,
      "skills/engineering/gamma/SKILL.md": `---\nname: gamma\ndescription: ${description}\n---\n\n# gamma\n`,
    });
    const run = runCli(CATALOG, root, "--check");
    assert.equal(run.status, 1, run.output);
    assert.ok(run.output.includes("skills/engineering/gamma/SKILL.md"), run.output);
    assert.ok(run.output.includes('Use when the user says "<phrase>"'), run.output);
  });
}

test("catalog --check exits 1 naming a stale block after a description changes", (t) => {
  const root = fixtureRepo(t, {
    "README.md": FIXTURE_README,
    "skills/engineering/gamma/SKILL.md":
      "---\nname: gamma\ndescription: 'Use for fixture checks. Use when the user says \"run gamma\".'\n---\n\n# gamma\n",
  });
  const write = runCli(CATALOG, root, "--write");
  assert.equal(write.status, 0, write.output);
  const fresh = runCli(CATALOG, root, "--check");
  assert.equal(fresh.status, 0, fresh.output);
  writeFileSync(
    join(root, "skills/engineering/gamma/SKILL.md"),
    "---\nname: gamma\ndescription: 'Use for changed checks. Use when the user says \"run gamma\".'\n---\n\n# gamma\n",
  );
  const stale = runCli(CATALOG, root, "--check");
  assert.equal(stale.status, 1, stale.output);
  assert.ok(stale.output.includes("stale"), stale.output);
});

test("build-site exits 1 naming a SKILL.md whose name differs from its directory", (t) => {
  const root = fixtureRepo(t, {
    "docs/CNAME": "skills.bostonaholic.dev\n",
    "docs/style.css": "body { margin: 0; }\n",
    "docs/copy-code.js": "",
    "skills/engineering/delta/SKILL.md":
      "---\nname: epsilon\ndescription: 'Use for fixture checks. Use when the user says \"run epsilon\".'\n---\n\n# delta\n",
  });
  const run = runCli(BUILD_SITE, root, join(root, "site"));
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/delta/SKILL.md"), run.output);
});
