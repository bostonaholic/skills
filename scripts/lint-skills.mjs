#!/usr/bin/env node
// Checks every tracked active skill against the mechanical rules in docs/skill-authoring.md and
// prints one `path: ID message` line per violation.
//   node scripts/lint-skills.mjs  exit 1 when any skill breaks a rule, 0 when all pass
// Rules: A1 name, A2 gerund name, A3 description limits, A4 third-person description, A5 "Use
// when" clause, C1 SKILL.md body under 500 lines, C3 every references/ and shared/ file linked
// from SKILL.md, C4 a `## Contents` table of contents in files over 100 lines, C5 forward-slash
// paths. Acts on the git repository at the working directory; skills come from `git ls-files`,
// and archived skills under skills/deprecated/ are skipped.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { FRONTMATTER, scalar } from "./catalog.mjs";
import { references } from "./sync-shared.mjs";

// Limits from the Agent Skills frontmatter specification and Anthropic's authoring guide.
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const BODY_MAX_LINES = 500;
// Files longer than this need a table of contents so a partial read still shows their scope.
const TOC_MIN_LINES = 100;

const NAME_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_WORDS = /anthropic|claude/;
const GERUND = /^[a-z]+ing(?:-|$)/;
const XML_TAG = /<\/?[A-Za-z][^>]*>/;
const THIRD_PERSON_VERB = /^[A-Z][a-z]+s\b/;
const NOT_A_VERB = new Set(["This", "Its"]);
// Hyphens count as word characters so names such as "oh-my-zsh" are not read as "my".
const FIRST_OR_SECOND_PERSON = /(?<![\w-])(?:I|I'm|I'll|me|my|you|you're|your)(?![\w-])/i;
const USE_WHEN = /\bUse when\b/;
const BUNDLED_MARKDOWN = /^(?:references\/.+|shared\/[^/]+)\.md$/;

function lsFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspecs], { encoding: "utf8" }).split("\0").filter(Boolean);
}

function lineCount(text) {
  return text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
}

function checkName(name, report) {
  if (!name) return report("A1", "no name");
  if (name.length > NAME_MAX) report("A1", `name is ${name.length} characters; the limit is ${NAME_MAX}`);
  if (!NAME_FORMAT.test(name)) report("A1", `name "${name}" must be lowercase letters, digits, and single hyphens`);
  if (RESERVED_WORDS.test(name)) report("A1", `name "${name}" contains a reserved word (anthropic, claude)`);
  if (!GERUND.test(name)) report("A2", `name "${name}" must start with a gerund (verb + -ing), as in "reviewing-code"`);
}

function checkDescription(description, report) {
  if (!description) return report("A3", "no description");
  if (description.length > DESCRIPTION_MAX) report("A3", `description is ${description.length} characters; the limit is ${DESCRIPTION_MAX}`);
  if (XML_TAG.test(description)) report("A3", "description contains an XML tag");
  const firstWord = description.split(/\s/)[0];
  if (!THIRD_PERSON_VERB.test(firstWord) || NOT_A_VERB.has(firstWord)) {
    report("A4", `description must open with a third-person verb, as in "Reviews ..."; it opens with "${firstWord}"`);
  }
  if (FIRST_OR_SECOND_PERSON.test(description)) report("A4", "description must be third person; it addresses I or you");
  if (!USE_WHEN.test(description)) report("A5", 'description must say when to use the skill with a "Use when ..." clause');
}

function checkLinks(dir, skillText, files, report) {
  const linked = new Set();
  for (const { target } of references(skillText, { spans: false })) linked.add(target.split("#")[0].replace(/^\.\//, ""));
  for (const path of files) {
    const relative = path.slice(dir.length + 1);
    if (BUNDLED_MARKDOWN.test(relative) && !linked.has(relative)) {
      report("C3", `${relative} is not linked from SKILL.md; link it as [..](${relative}) with when to read it`);
    }
  }
}

function checkFile(path, text, report) {
  if (!path.endsWith("/SKILL.md") && lineCount(text) > TOC_MIN_LINES) {
    const firstSection = text.match(/^## (.*)$/m)?.[1].trim();
    if (firstSection !== "Contents") report("C4", `${lineCount(text)} lines; open with a "## Contents" section listing the sections`);
  }
  for (const { line, target } of references(text, { spans: true })) {
    if (target.includes("\\") && /\.[a-z]+$/i.test(target)) report("C5", `line ${line}: use forward slashes in "${target}"`);
  }
}

// Returns every violation as "path: ID message", sorted by path.
export function lintSkills() {
  const problems = [];
  const skills = lsFiles("skills/*/*/SKILL.md")
    .filter((path) => /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path))
    .sort();
  for (const skillPath of skills) {
    const dir = dirname(skillPath);
    const files = lsFiles(dir).filter((path) => path.endsWith(".md"));
    const skillText = readFileSync(skillPath, "utf8");
    const reportFor = (path) => (id, message) => problems.push(`${path}: ${id} ${message}`);
    const report = reportFor(skillPath);
    const frontmatter = skillText.match(FRONTMATTER);
    if (!frontmatter) {
      report("A1", "no frontmatter");
      continue;
    }
    checkName(scalar(frontmatter[1], "name"), report);
    checkDescription(scalar(frontmatter[1], "description"), report);
    const bodyLines = lineCount(skillText.slice(frontmatter[0].length));
    if (bodyLines >= BODY_MAX_LINES) report("C1", `body is ${bodyLines} lines; keep it under ${BODY_MAX_LINES} by moving detail into references/`);
    checkLinks(dir, skillText, files, report);
    for (const path of files) checkFile(path, path === skillPath ? skillText : readFileSync(path, "utf8"), reportFor(path));
  }
  return problems;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error(`usage: node scripts/${basename(process.argv[1])}`);
    process.exit(1);
  }
  const problems = lintSkills();
  if (problems.length) {
    console.error(`${problems.join("\n")}\n${problems.length} problem(s). See docs/skill-authoring.md.`);
    process.exit(1);
  }
}
