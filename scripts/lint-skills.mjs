#!/usr/bin/env node
// Checks every tracked active skill and every tracked agents/*.md subagent against the mechanical
// rules in docs/skill-authoring.md and prints one `path: ID message` line per violation.
//   node scripts/lint-skills.mjs  exit 1 when any skill breaks a rule, 0 when all pass
// Rules: A1 name, A2 gerund name, A3 description limits, A4 third-person description, A5 "Use
// when" clause, A7 agents/openai.yaml present and agreeing on invocation, B3 no harness-specific files, frontmatter keys, or SKILL.md substitutions, B5 a
// skill call only with a shared/skill-calls.md link from SKILL.md, C1 SKILL.md body of at most
// 100 lines, C3 every references/ and shared/ file linked from SKILL.md, C4 a `## Contents` table
// of contents in files over 100 lines, C5 forward-slash paths, C6 no SKILL.md prose paragraph over
// 50 words, C7 links and <skill-dir>/ paths that name tracked files in the skill, C8 -dir and -root
// placeholders that name only the skill's own directory, G1 a trigger, guard, and core eval case
// per skill. Subagents get A3 to A5 on their description, S1 a tier-alias model, S2 readonly: true
// beside a tools list with no write tool, and S3 a name that is not a gerund. Acts on the git repository at the working directory; skills come from `git ls-files`,
// and archived skills under skills/deprecated/ are skipped.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { FRONTMATTER, SKILL_CALL, scalar } from "./catalog.mjs";
import { references } from "./sync-shared.mjs";

// Every ID this script reports. tests/lint-skills.test.mjs compares it with the
// docs/skill-authoring.md rows marked **lint**, so a new check and its row land together.
export const LINT_IDS = Object.freeze([
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A7",
  "B3",
  "B5",
  "C1",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "G1",
  "S1",
  "S2",
  "S3",
]);

// Skills that ship without their eval cases, each with why. The lint only skips these skills;
// only the real-tree test in tests/lint-skills.test.mjs checks an entry, so a fixture repository
// without these skills still passes, and that test fails once an entry goes stale.
export const EVALS_PENDING = Object.freeze({
  "fixing-root-causes": "no eval cases yet; writing them is deferred",
  "updating-bostonaholic-skills": "no eval cases yet; writing them is deferred",
  "writing-no-tests": "no eval cases yet; writing them is deferred",
});

// Limits from the Agent Skills frontmatter specification and Anthropic's authoring guide.
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
// A SKILL.md is a short checklist; detail past this belongs in references/.
const BODY_MAX_LINES = 100;
// Files longer than this need a table of contents so a partial read still shows their scope.
const TOC_MIN_LINES = 100;
// About three wrapped lines: past this a paragraph reads as an essay, not a checklist item.
const PARAGRAPH_MAX_WORDS = 50;

// The Agent Skills specification's fields, plus invocation metadata that other harnesses ignore.
// Anything else, such as `hooks` or `allowed-tools`, binds the skill to one harness.
const FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "argument-hint",
  "effort",
  "disable-model-invocation",
  "user-invocable",
]);
// A skill ships only files every harness reads the same way.
const SKILL_FILE = /^(?:SKILL\.md|agents\/openai\.yaml|(?:references|scripts|shared)\/.+)$/;
// Claude Code expands these in SKILL.md before the model reads it; other harnesses show them raw.
const HARNESS_SUBSTITUTIONS = [
  [/\$ARGUMENTS/, "$ARGUMENTS"],
  [/\$\d\b/, "$N"],
  [/\$\{CLAUDE_[A-Z_]*\}/, "${CLAUDE_*}"],
  [/!`/, "!`command`"],
];

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
// The fallback for harnesses with no Skill tool, which every skill that calls another links.
const SKILL_CALL_RULES = "shared/skill-calls.md";
// Subagents pin a tier alias, so a model update reaches them without an edit (rule 12).
const MODEL_ALIASES = new Set(["opus", "sonnet", "haiku"]);
// Claude Code tools that change files. Cursor ignores `tools`, so a subagent with none of these
// must also set readonly: true; S2's message lists them so a new write tool is easy to spot.
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const AGENT_FILE = /^agents\/[^/]+\.md$/;
// An eval case is a directory with a prompt.md, per the Layout section of docs/skill-authoring.md.
const EVAL_PROMPT = /^evals\/(engineering|productivity)\/[^/]+\/[^/]+\/prompt\.md$/;
// The cases every skill needs, per the same Layout section.
const EVAL_CASES = ["trigger", "guard", "core"];
// A path from the skill directory. Skill script and reference names use only these characters, so
// the path ends at the first quote, backtick, comma, `<`, or space around it.
const SKILL_DIR_PATH = /<((?:[a-z0-9-]+-)?skill-dir)>\/([A-Za-z0-9._/-]*)/g;
// Placeholders for a directory. Only the skill's own directory may use these endings.
const DIR_PLACEHOLDER = /<([a-z0-9-]+)-(dir|root)>/g;
// A URL or other target outside the repository, such as https: or mailto:.
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// The C5 test for a path-like target: one that ends in a file extension.
const FILE_EXTENSION = /\.[a-z]+$/i;

function lsFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspecs], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function lineCount(text) {
  return text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
}

function checkName(name, report) {
  if (!name) return report("A1", "no name");
  if (name.length > NAME_MAX)
    report("A1", `name is ${name.length} characters; the limit is ${NAME_MAX}`);
  if (!NAME_FORMAT.test(name))
    report("A1", `name "${name}" must be lowercase letters, digits, and single hyphens`);
  if (RESERVED_WORDS.test(name))
    report("A1", `name "${name}" contains a reserved word (anthropic, claude)`);
  if (!GERUND.test(name))
    report("A2", `name "${name}" must start with a gerund (verb + -ing), as in "reviewing-code"`);
}

function checkDescription(description, report) {
  if (!description) return report("A3", "no description");
  if (description.length > DESCRIPTION_MAX)
    report(
      "A3",
      `description is ${description.length} characters; the limit is ${DESCRIPTION_MAX}`,
    );
  if (XML_TAG.test(description)) report("A3", "description contains an XML tag");
  const firstWord = description.split(/\s/)[0];
  if (!THIRD_PERSON_VERB.test(firstWord) || NOT_A_VERB.has(firstWord)) {
    report(
      "A4",
      `description must open with a third-person verb, as in "Reviews ..."; it opens with "${firstWord}"`,
    );
  }
  if (FIRST_OR_SECOND_PERSON.test(description))
    report("A4", "description must be third person; it addresses I or you");
  if (!USE_WHEN.test(description))
    report("A5", 'description must say when to use the skill with a "Use when ..." clause');
}

function checkPortability(dir, frontmatter, body, files, report) {
  for (const key of frontmatter.match(/^[A-Za-z][\w-]*(?=:)/gm) ?? [])
    if (!FRONTMATTER_KEYS.has(key))
      report("B3", `frontmatter key "${key}" is harness-specific; remove it`);
  for (const path of files) {
    const relative = path.slice(dir.length + 1);
    if (!SKILL_FILE.test(relative))
      report(
        "B3",
        `${relative} is outside SKILL.md, agents/openai.yaml, references/, scripts/, and shared/`,
      );
  }
  for (const [pattern, name] of HARNESS_SUBSTITUTIONS)
    if (pattern.test(body))
      report("B3", `${name} is a harness substitution; say what it stands for in plain words`);
}

// A7. A missing policy block allows implicit invocation, which is Codex's default.
function checkInvocation(dir, frontmatter, tracked, report) {
  const yamlPath = `${dir}/agents/openai.yaml`;
  if (!tracked.has(yamlPath)) return report("A7", "no agents/openai.yaml; add one");
  const disable = scalar(frontmatter, "disable-model-invocation");
  const allow = scalar(readFileSync(yamlPath, "utf8"), "allow_implicit_invocation");
  let malformed = false;
  for (const [key, value] of [
    ["disable-model-invocation", disable],
    ["allow_implicit_invocation", allow],
  ]) {
    if (value !== undefined && value !== "true" && value !== "false") {
      report("A7", `${key} is "${value}"; write true or false`);
      malformed = true;
    }
  }
  if (malformed) return;
  if (disable === "true" && allow !== "false")
    report(
      "A7",
      "disable-model-invocation is true, so agents/openai.yaml must set policy.allow_implicit_invocation: false",
    );
  if (disable !== "true" && allow === "false")
    report(
      "A7",
      "policy.allow_implicit_invocation is false, so SKILL.md must set disable-model-invocation: true",
    );
}

// Prose paragraphs outside fences, headings, list items, tables, and indented continuations.
function checkChecklistShape(body, report) {
  let fenced = false;
  let words = 0;
  let start = 0;
  const lines = body.split(/\r?\n/);
  const flush = () => {
    if (words > PARAGRAPH_MAX_WORDS)
      report(
        "C6",
        `body line ${start}: ${words}-word paragraph; split it into list items or move it to references/`,
      );
    words = 0;
  };
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fenced = !fenced;
    } else if (fenced || /^\s*$|^#|^\s*(?:[-*+]|\d+\.)\s|^\s*\||^\s{2,}\S|^>/.test(line)) {
      flush();
    } else {
      if (!words) start = index + 1;
      words += line.trim().split(/\s+/).length;
    }
  });
  flush();
}

// SKILL.md link targets without their #anchor or leading ./.
function linkTargets(skillText) {
  const linked = new Set();
  for (const { target } of references(skillText, { spans: false }))
    linked.add(target.split("#")[0].replace(/^\.\//, ""));
  return linked;
}

function checkLinks(dir, linked, files, report) {
  for (const path of files) {
    const relative = path.slice(dir.length + 1);
    if (BUNDLED_MARKDOWN.test(relative) && !linked.has(relative)) {
      report(
        "C3",
        `${relative} is not linked from SKILL.md; link it as [..](${relative}) with when to read it`,
      );
    }
  }
}

// matchAll on the whole text, because a call can break across lines and a global regex keeps
// state between .test() calls.
function checkSkillCalls(dir, linked, texts, report) {
  if (linked.has(SKILL_CALL_RULES)) return;
  for (const [path, text] of texts) {
    const call = text.matchAll(SKILL_CALL).next().value;
    if (!call) continue;
    return report(
      "B5",
      `${path.slice(dir.length + 1)} calls ${call[1]} with the Skill tool; link [skill call rules](${SKILL_CALL_RULES}) from SKILL.md`,
    );
  }
}

function checkFile(path, text, report) {
  if (!path.endsWith("/SKILL.md") && lineCount(text) > TOC_MIN_LINES) {
    const firstSection = text.match(/^## (.*)$/m)?.[1].trim();
    if (firstSection !== "Contents")
      report(
        "C4",
        `${lineCount(text)} lines; open with a "## Contents" section listing the sections`,
      );
  }
  for (const { line, target } of references(text, { spans: true })) {
    if (target.includes("\\") && FILE_EXTENSION.test(target))
      report("C5", `line ${line}: use forward slashes in "${target}"`);
  }
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function ownsPlaceholder(dir, name) {
  return name === "skill" || name === `${basename(dir)}-skill`;
}

// C7. Links resolve from shared/ inside a shared/ copy and from the skill directory elsewhere;
// <skill-dir>/ paths always resolve from the skill directory.
function checkLinkTargets(dir, path, text, tracked, report) {
  const inShared = path.startsWith(`${dir}/shared/`);
  const base = inShared ? `${dir}/shared` : dir;
  for (const { line, target: raw } of references(text, { spans: false })) {
    if (URL_SCHEME.test(raw) || raw.startsWith("#") || raw.startsWith("<") || raw.includes("\\"))
      continue;
    const target = raw.split("#")[0].replace(/^\.\//, "");
    if (!FILE_EXTENSION.test(target)) continue;
    const resolved = posix.normalize(posix.join(base, target));
    if (resolved.startsWith(`${dir}/`) && tracked.has(resolved)) continue;
    const prefix = posix.dirname(path).slice(dir.length + 1);
    const hint =
      !inShared && prefix && tracked.has(`${dir}/${prefix}/${target}`)
        ? ` Link from the skill directory, as in ${prefix}/${target}`
        : "";
    report("C7", `line ${line}: "${target}" is not a tracked file at ${resolved}.${hint}`);
  }
  for (const match of text.matchAll(SKILL_DIR_PATH)) {
    if (!ownsPlaceholder(dir, match[1].replace(/-dir$/, ""))) continue;
    const relative = match[2].replace(/\.$/, "");
    const resolved = `${dir}/${relative}`;
    const found = relative.endsWith("/")
      ? [...tracked].some((file) => file.startsWith(resolved))
      : !relative || tracked.has(resolved);
    if (!found)
      report(
        "C7",
        `line ${lineAt(text, match.index)}: "<${match[1]}>/${relative}" is not a tracked ${relative.endsWith("/") ? "directory" : "file"} at ${resolved}.`,
      );
  }
}

// C8
function checkPlaceholders(dir, text, report) {
  for (const match of text.matchAll(DIR_PLACEHOLDER)) {
    if (match[2] === "dir" && ownsPlaceholder(dir, match[1])) continue;
    report(
      "C8",
      `line ${lineAt(text, match.index)}: placeholder "${match[0]}" ends in -dir or -root but does not name this skill's directory; rename it, as in <out>`,
    );
  }
}

// Returns the trigger, guard, and core case names of skills/<category>/<name>/SKILL.md that have no
// prompt.md in `tracked`, a Set of eval prompt paths.
export function missingEvalCases(skillPath, tracked) {
  const [, category, name] = skillPath.split("/");
  return EVAL_CASES.map((kind) => `${name}-${kind}`).filter(
    (evalCase) => !tracked.has(`evals/${category}/${name}/${evalCase}/prompt.md`),
  );
}

// G1
function checkEvalCases(skillPath, evalPrompts, report) {
  const [, category, name] = skillPath.split("/");
  if (Object.hasOwn(EVALS_PENDING, name)) return;
  const missing = missingEvalCases(skillPath, evalPrompts);
  if (missing.length)
    report(
      "G1",
      `evals/${category}/${name}/ lacks ${new Intl.ListFormat("en").format(missing)}, each a directory with a prompt.md`,
    );
}

// A frontmatter list written as `key: a, b` or as `key:` followed by `  - item` lines.
function listField(frontmatter, key) {
  const inline = scalar(frontmatter, key);
  if (inline) return inline.split(",").map((item) => item.trim());
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line));
  if (start === -1) return undefined;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (!item) break;
    items.push(item[1].trim());
  }
  return items;
}

// A3 to A5 on the description, then S1 to S3.
function lintAgent(text, report) {
  const frontmatter = text.match(FRONTMATTER)?.[1];
  if (frontmatter === undefined) {
    report("A3", "no frontmatter");
    return report("S1", "no model");
  }
  checkDescription(scalar(frontmatter, "description"), report);
  const model = scalar(frontmatter, "model");
  if (!model) report("S1", "no model");
  else if (!MODEL_ALIASES.has(model))
    report("S1", `model "${model}" must be a tier alias: opus, sonnet, or haiku`);
  const tools = listField(frontmatter, "tools");
  const writes = (tools ?? []).filter((tool) => WRITE_TOOLS.has(tool));
  const readonly = scalar(frontmatter, "readonly") === "true";
  if (tools && !writes.length && !readonly)
    report("S2", "tools holds no write tool, so set readonly: true");
  if (readonly && !tools)
    report("S2", "readonly: true needs a tools list beside it, since Cursor ignores tools");
  if (readonly && writes.length)
    report(
      "S2",
      `readonly: true, but tools holds ${writes.join(", ")}; drop the write tools (${[...WRITE_TOOLS].join(", ")}) or readonly`,
    );
  const name = scalar(frontmatter, "name");
  if (name && GERUND.test(name))
    report(
      "S3",
      `name "${name}" reads as a gerund; name a subagent with a role noun, as in "oracle"`,
    );
}

// Returns every violation as "path: ID message", sorted by path.
export function lintSkills() {
  const problems = [];
  const reportFor = (path) => (id, message) => problems.push(`${path}: ${id} ${message}`);
  for (const path of lsFiles("agents")
    .filter((file) => AGENT_FILE.test(file))
    .sort())
    lintAgent(readFileSync(path, "utf8"), reportFor(path));
  const skills = lsFiles("skills/*/*/SKILL.md")
    .filter((path) => /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path))
    .sort();
  const evalPrompts = new Set(lsFiles("evals").filter((path) => EVAL_PROMPT.test(path)));
  for (const skillPath of skills) {
    const dir = dirname(skillPath);
    const tracked = lsFiles(dir);
    const files = tracked.filter((path) => path.endsWith(".md"));
    const skillText = readFileSync(skillPath, "utf8");
    const report = reportFor(skillPath);
    const frontmatter = skillText.match(FRONTMATTER);
    if (!frontmatter) {
      report("A1", "no frontmatter");
      continue;
    }
    checkName(scalar(frontmatter[1], "name"), report);
    checkDescription(scalar(frontmatter[1], "description"), report);
    const body = skillText.slice(frontmatter[0].length);
    checkPortability(dir, frontmatter[1], body, tracked, report);
    const trackedSet = new Set(tracked);
    checkInvocation(dir, frontmatter[1], trackedSet, report);
    const bodyLines = lineCount(body);
    if (bodyLines > BODY_MAX_LINES)
      report(
        "C1",
        `body is ${bodyLines} lines; keep it to ${BODY_MAX_LINES} by moving detail into references/`,
      );
    checkChecklistShape(body, report);
    const texts = new Map(
      files.map((path) => [path, path === skillPath ? skillText : readFileSync(path, "utf8")]),
    );
    const linked = linkTargets(skillText);
    checkLinks(dir, linked, files, report);
    checkSkillCalls(dir, linked, texts, report);
    checkEvalCases(skillPath, evalPrompts, report);
    for (const [path, text] of texts) {
      checkFile(path, text, reportFor(path));
      checkLinkTargets(dir, path, text, trackedSet, reportFor(path));
      checkPlaceholders(dir, text, reportFor(path));
    }
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
    console.error(
      `${problems.join("\n")}\n${problems.length} problem(s). See docs/skill-authoring.md.`,
    );
    process.exit(1);
  }
}
