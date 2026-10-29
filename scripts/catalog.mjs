#!/usr/bin/env node
// Builds the skill catalog from each tracked skill's SKILL.md frontmatter and agents/openai.yaml,
// and renders the README.md block between the generated markers.
//   node scripts/catalog.mjs --write  rewrite the README.md block
//   node scripts/catalog.mjs --check  write nothing; exit 1 when the block is stale
// Acts on the git repository at the working directory. Skills come from `git ls-files`, so
// untracked skill directories are ignored.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const LEDE = "The skills I use to build software with coding agents.";

export const REPO_URL = "https://github.com/bostonaholic/skills";
export const NPX_ADD_SKILL = "npx skills@latest add bostonaholic/skills --skill <name>";

// Two install paths. Claude Code installs with one slash command. Other agents get the pasted
// prompt, which sends them to AGENTS.md, which links INSTALL.md.
export const CLAUDE_CODE_INSTALL_COMMAND =
  "/plugin install bostonaholic --marketplace bostonaholic/skills";
export const INSTALL_PROMPT_LABEL = "Ask your agent:";
export const INSTALL_PROMPT = `Install the skills from ${REPO_URL}, refer to the repo's AGENTS.md for instructions.`;
export const INSTALL_DOC = "INSTALL.md";

export const README_START = "<!-- generated:start -->";
export const README_END = "<!-- generated:end -->";

const TABLE_HEADER = ["Skill", "Say", "Invoked by", "What it does"];
const SAY_LEGEND =
  "Say a quoted phrase, or ask in your own words, and the matching skill loads. A skill shown as a command starts only when you run it, written in [the form your harness uses](AGENTS.md#what-the-skills-are). Invoked by lists what can start a skill: you (user), the agent on its own (model), or another skill (skill).";
const CALLS_LEAD = "Some skills call others. Install the skills they call too.";

export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
export const SKILL_CALL = /call\s+the\s+Skill\s+tool\s+with\s+`([a-z0-9-]+)`/gi;
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/;
// The phrase a model-invoked skill's `Use when` clause quotes, shown in the README Say column.
const SAY_PHRASE = /\bUse when the user says "([^"]+)"/;

// A problem with the repository's input files. The CLIs report its message and exit 1.
export class CatalogError extends Error {}

function lsFiles(pathspec) {
  return execFileSync("git", ["ls-files", "-z", "--", pathspec], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

export function scalar(text, key) {
  const value = text.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"))?.[1].trim();
  return value ? unquote(value) : undefined;
}

function calls(dir, skillNames) {
  const called = new Set();
  for (const path of lsFiles(dir)) {
    if (!path.endsWith(".md")) continue;
    for (const [, name] of readFileSync(path, "utf8").matchAll(SKILL_CALL)) {
      if (name !== basename(dir) && skillNames.has(name)) called.add(name);
    }
  }
  return [...called].sort();
}

function loadSkill(path, skillNames, errors) {
  const dir = dirname(path);
  const directoryName = basename(dir);
  const frontmatter = readFileSync(path, "utf8").match(FRONTMATTER)?.[1];
  if (frontmatter === undefined) {
    errors.push(`${path}: no frontmatter`);
    return null;
  }
  const name = scalar(frontmatter, "name");
  const description = scalar(frontmatter, "description");
  if (!name) errors.push(`${path}: no name`);
  else if (name !== directoryName)
    errors.push(`${path}: name "${name}" differs from its directory "${directoryName}"`);
  if (!description) errors.push(`${path}: no description`);
  const userInvoked = scalar(frontmatter, "disable-model-invocation") === "true";
  const say = description?.match(SAY_PHRASE)?.[1];
  if (!userInvoked && !say)
    errors.push(
      `${path}: description has no 'Use when the user says "<phrase>"' for the Say column`,
    );
  if (name !== directoryName || !description || (!userInvoked && !say)) return null;

  const yamlPath = `${dir}/agents/openai.yaml`;
  const yaml = existsSync(yamlPath) ? readFileSync(yamlPath, "utf8") : "";
  const shortDescription =
    scalar(yaml, "short_description") ?? description.match(FIRST_SENTENCE)?.[0] ?? description;
  return {
    name,
    directory: dir,
    category: path.split("/")[1],
    displayName: scalar(yaml, "display_name") ?? name,
    summary: shortDescription.replace(/\.$/, ""),
    description,
    argumentHint: scalar(frontmatter, "argument-hint") ?? "",
    userInvoked,
    modelOnly: scalar(frontmatter, "user-invocable") === "false",
    say,
    calls: calls(dir, skillNames),
  };
}

// Returns the tracked skills sorted by name. Throws CatalogError naming every bad SKILL.md.
export function loadCatalog() {
  const paths = lsFiles("skills/*/*/SKILL.md").filter((path) =>
    /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path),
  );
  const skillNames = new Set();
  const errors = [];
  for (const path of paths) {
    const name = basename(dirname(path));
    if (skillNames.has(name))
      errors.push(`${path}: duplicate skill name "${name}" across categories`);
    skillNames.add(name);
  }
  const skills = paths.map((path) => loadSkill(path, skillNames, errors));
  if (errors.length) throw new CatalogError(errors.join("\n"));
  return skills.sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function skillGroups(catalog) {
  return [
    { heading: "Engineering", skills: catalog.filter((skill) => skill.category === "engineering") },
    {
      heading: "Productivity",
      skills: catalog.filter((skill) => skill.category === "productivity"),
    },
  ].filter((group) => group.skills.length);
}

function invokedBy(skill, called) {
  return [
    !skill.modelOnly && "user",
    !skill.userInvoked && "model",
    called.has(skill.name) && "skill",
  ]
    .filter(Boolean)
    .join(", ");
}

function tableRow(skill, called) {
  return [
    `[\`${skill.name}\`](./${skill.directory}/SKILL.md)`,
    skill.userInvoked ? `\`/${skill.name}\`` : `"${skill.say}"`,
    invokedBy(skill, called),
    `${skill.summary}.`,
  ];
}

function callsLine(skill) {
  return `- \`${skill.name}\` calls ${skill.calls.map((name) => `\`${name}\``).join(", ")}.`;
}

// Keeps a cell on one table row: a newline would end the row and a bare pipe would split it.
// Backslashes are escaped too, or a summary's own `\|` would become `\\|` and split the cell.
function escapeCell(text) {
  return text.replace(/\r?\n/g, " ").replace(/[\\|]/g, "\\$&");
}

// Pads every cell to its column's widest cell, header included, because oxfmt pads tables that
// way: unpadded output would make `npm run format:check` and `--check` disagree. Cells are
// escaped first so the widths measure the bytes written.
function table(rawRows) {
  const rows = rawRows.map((row) => row.map(escapeCell));
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const line = (cells) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`;
  const [header, ...body] = rows;
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...body.map(line)];
}

// Returns the text strictly between README_START and README_END.
export function renderReadme(catalog) {
  const called = new Set(catalog.flatMap((skill) => skill.calls));
  const lines = [
    LEDE,
    "",
    "## Install",
    "",
    "```text",
    CLAUDE_CODE_INSTALL_COMMAND,
    "```",
    "",
    INSTALL_PROMPT_LABEL,
    "",
    "```text",
    INSTALL_PROMPT,
    "```",
    "",
  ];
  lines.push(`Or follow the [installation instructions](${INSTALL_DOC}).`, "", "## Skills", "");
  lines.push(SAY_LEGEND, "");
  for (const group of skillGroups(catalog)) {
    lines.push(
      `### ${group.heading}`,
      "",
      ...table([TABLE_HEADER, ...group.skills.map((skill) => tableRow(skill, called))]),
      "",
    );
  }
  const callers = catalog.filter((skill) => skill.calls.length);
  if (callers.length)
    lines.push("### Skill calls", "", CALLS_LEAD, "", ...callers.map(callsLine), "");
  return `\n\n${lines.join("\n")}\n`;
}

function markerBounds(readme) {
  const start = readme.indexOf(README_START);
  if (start === -1) throw new CatalogError(`README.md: no ${README_START} marker`);
  const end = readme.indexOf(README_END, start);
  if (end === -1)
    throw new CatalogError(`README.md: no ${README_END} marker after ${README_START}`);
  return { start: start + README_START.length, end };
}

function run(mode) {
  const block = renderReadme(loadCatalog());
  const readme = readFileSync("README.md", "utf8");
  const { start, end } = markerBounds(readme);
  if (mode === "--write")
    writeFileSync("README.md", readme.slice(0, start) + block + readme.slice(end));
  else if (readme.slice(start, end) !== block)
    throw new CatalogError("README.md: the generated block is stale. Run npm run readme.");
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["--write", "--check"].includes(mode)) {
    console.error("usage: node scripts/catalog.mjs --write | --check");
    process.exit(1);
  }
  try {
    run(mode);
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
