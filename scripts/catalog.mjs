#!/usr/bin/env node
// Builds the skill catalog from each tracked skill's SKILL.md frontmatter and agents/openai.yaml,
// and renders the README.md block between the generated markers.
//   node scripts/catalog.mjs --write  rewrite the README.md block
//   node scripts/catalog.mjs --check  write nothing; exit 1 when the block is stale
// Acts on the git repository at the working directory. Skills come from `git ls-files`, so
// untracked skill directories are ignored.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LEDE = "Agent skills for pull requests, code and design review, codebase audits, and investigation. Each skill installs on its own.";

export const EXTRACTION_NOTE = "These skills were extracted from the Team plugin. They do not need Team, and Team does not need them.";

export const CLAUDE_MARKETPLACE_ADD = "claude plugin marketplace add bostonaholic/skills";
export const CLAUDE_PLUGIN_INSTALL = "claude plugin install bostonaholic-skills@bostonaholic";
export const CLAUDE_MARKETPLACE_UPDATE = "claude plugin marketplace update bostonaholic";
export const CLAUDE_PLUGIN_UPDATE = "claude plugin update bostonaholic-skills@bostonaholic";
export const NPX_ADD_ALL = "npx skills@latest add bostonaholic/skills";
export const NPX_ADD_SKILL = "npx skills@latest add bostonaholic/skills --skill <name>";
export const NPX_UPDATE_SKILL = "npx skills@latest update <name>";

export const INSTALL_INTRO =
  "Two ways in. The Claude Code plugin installs every skill as one managed bundle that updates when a new version ships. `npx skills` copies the skills you pick into your project or home directory, for Claude Code, Codex, and other agents; you own and edit the copies. Pick one: installing both gives you every skill twice.";

// Each block is either a run of shell commands or one line of text.
export const INSTALL_ROUTES = [
  {
    heading: "Claude Code",
    blocks: [
      { commands: [CLAUDE_MARKETPLACE_ADD, CLAUDE_PLUGIN_INSTALL] },
      { text: "Update the marketplace first, then the plugin:" },
      { commands: [CLAUDE_MARKETPLACE_UPDATE, CLAUDE_PLUGIN_UPDATE] },
    ],
  },
  {
    heading: "Any agent, whole set",
    blocks: [{ commands: [NPX_ADD_ALL] }, { text: "Pick the skills you want, and which agents to install them on." }],
  },
  {
    heading: "One skill",
    blocks: [{ commands: [NPX_ADD_SKILL] }, { text: "To update it:" }, { commands: [NPX_UPDATE_SKILL] }],
  },
];

export const INSTALL_OUTRO = "A skill that calls another skill names it, and stops or falls back when that skill is missing.";

export const README_START = "<!-- generated:start -->";
export const README_END = "<!-- generated:end -->";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const SKILL_CALL = /call\s+the\s+Skill\s+tool\s+with\s+`([a-z0-9-]+)`/gi;
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/;

// A problem with the repository's input files. The CLIs report its message and exit 1.
export class CatalogError extends Error {}

function lsFiles(pathspec) {
  return execFileSync("git", ["ls-files", "-z", "--", pathspec], { encoding: "utf8" }).split("\0").filter(Boolean);
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function scalar(text, key) {
  const value = text.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"))?.[1].trim();
  return value ? unquote(value) : undefined;
}

function calls(dir, skillNames) {
  const called = new Set();
  for (const path of lsFiles(`skills/${dir}`)) {
    if (!path.endsWith(".md")) continue;
    for (const [, name] of readFileSync(path, "utf8").matchAll(SKILL_CALL)) {
      if (name !== dir && skillNames.has(name)) called.add(name);
    }
  }
  return [...called].sort();
}

function loadSkill(path, skillNames, errors) {
  const dir = path.split("/")[1];
  const frontmatter = readFileSync(path, "utf8").match(FRONTMATTER)?.[1];
  if (frontmatter === undefined) {
    errors.push(`${path}: no frontmatter`);
    return null;
  }
  const name = scalar(frontmatter, "name");
  const description = scalar(frontmatter, "description");
  if (!name) errors.push(`${path}: no name`);
  else if (name !== dir) errors.push(`${path}: name "${name}" differs from its directory "${dir}"`);
  if (!description) errors.push(`${path}: no description`);
  if (name !== dir || !description) return null;

  const yamlPath = `skills/${dir}/agents/openai.yaml`;
  const yaml = existsSync(yamlPath) ? readFileSync(yamlPath, "utf8") : "";
  const shortDescription = scalar(yaml, "short_description") ?? description.match(FIRST_SENTENCE)?.[0] ?? description;
  return {
    name,
    displayName: scalar(yaml, "display_name") ?? name,
    summary: shortDescription.replace(/\.$/, ""),
    description,
    argumentHint: scalar(frontmatter, "argument-hint") ?? "",
    userInvoked: scalar(frontmatter, "disable-model-invocation") === "true",
    calls: calls(dir, skillNames),
  };
}

// Returns the tracked skills sorted by name. Throws CatalogError naming every bad SKILL.md.
export function loadCatalog() {
  const paths = lsFiles("skills/*/SKILL.md").filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path));
  const skillNames = new Set(paths.map((path) => path.split("/")[1]));
  const errors = [];
  const skills = paths.map((path) => loadSkill(path, skillNames, errors));
  if (errors.length) throw new CatalogError(errors.join("\n"));
  return skills.sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function skillGroups(catalog) {
  return [
    { heading: "User-invoked", skills: catalog.filter((skill) => skill.userInvoked) },
    { heading: "Model-invoked", skills: catalog.filter((skill) => !skill.userInvoked) },
  ].filter((group) => group.skills.length);
}

function readmeEntry(skill) {
  const entry = `- **[${skill.name}](./skills/${skill.name}/SKILL.md)**: ${skill.summary}.`;
  if (!skill.calls.length) return entry;
  return `${entry} Calls: ${skill.calls.map((name) => `\`${name}\``).join(", ")}.`;
}

// Returns the text strictly between README_START and README_END.
export function renderReadme(catalog) {
  const lines = [LEDE, "", EXTRACTION_NOTE, "", "## Install", "", INSTALL_INTRO, ""];
  for (const route of INSTALL_ROUTES) {
    lines.push(`### ${route.heading}`, "");
    for (const block of route.blocks) {
      lines.push(...(block.commands ? ["```sh", ...block.commands, "```"] : [block.text]), "");
    }
  }
  lines.push(INSTALL_OUTRO, "", "## Skills", "");
  for (const group of skillGroups(catalog)) {
    lines.push(`### ${group.heading}`, "", ...group.skills.map(readmeEntry), "");
  }
  return `\n\n${lines.join("\n")}\n`;
}

function markerBounds(readme) {
  const start = readme.indexOf(README_START);
  if (start === -1) throw new CatalogError(`README.md: no ${README_START} marker`);
  const end = readme.indexOf(README_END, start);
  if (end === -1) throw new CatalogError(`README.md: no ${README_END} marker after ${README_START}`);
  return { start: start + README_START.length, end };
}

function run(mode) {
  const block = renderReadme(loadCatalog());
  const readme = readFileSync("README.md", "utf8");
  const { start, end } = markerBounds(readme);
  if (mode === "--write") writeFileSync("README.md", readme.slice(0, start) + block + readme.slice(end));
  else if (readme.slice(start, end) !== block) throw new CatalogError("README.md: the generated block is stale. Run npm run readme.");
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
