#!/usr/bin/env node
// Lists the rules in a repository's instruction files and in Claude Code memory files, each with the
// checks in that repository that quote one of its code spans.
// Usage: list-rules.mjs <repo> [--memory-root <dir>]
//   --memory-root  the directory holding <project>/memory/*.md; default ~/.claude/projects
//   exit 0  printed one JSON object: {repo, memoryRoot, checkFiles, rules}
//   exit 1  printed nothing; stderr names the failure: <repo> is not a git work tree
//   exit 2  bad arguments; stderr prints the usage line
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "list-rules.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <repo> [--memory-root <dir>]\n`;

// Only a span shaped like a command, flag, or setting counts: a shorter span such as `-a`, or a bare
// word or file name such as `status` or `AGENTS.md`, matches too many lines that check nothing.
const MIN_SPAN = 6;
const COMMAND_LIKE = /\s|^-|=/;
const MAX_HITS = 5;
const MAX_TEXT = 200;
const RULE_WORDS = /\b(never|always|must|do not|don't|should|only|prefer|avoid)\b/i;
const IMPERATIVE =
  /^(add|ask|check|commit|confirm|create|delete|keep|leave|make|put|read|remove|run|set|state|stop|use|verify|write)\b/i;
const CHECK_DIRS = [
  [".github/workflows/", "ci"],
  [".claude/hooks/", "hook"],
  ["scripts/", "script"],
  ["tests/", "test"],
];
// Memory types that state facts about people or pointers, not rules about how to work.
const NOT_RULES = new Set(["user", "reference"]);

class UsageError extends Error {}

export function parseArgs(argv) {
  const args = { repo: null, memoryRoot: join(homedir(), ".claude", "projects") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--memory-root") {
      if (!argv[i + 1]) throw new UsageError("--memory-root needs a directory");
      args.memoryRoot = argv[(i += 1)];
    } else if (args.repo === null && !argv[i].startsWith("-")) {
      args.repo = argv[i];
    } else {
      throw new UsageError(`unexpected argument ${argv[i]}`);
    }
  }
  if (args.repo === null) throw new UsageError("missing <repo>");
  return args;
}

export function codeSpans(text) {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
  return [...new Set(spans.filter((span) => span.length >= MIN_SPAN && COMMAND_LIKE.test(span)))];
}

function stripMarkers(sentence) {
  return sentence
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/[*_]/g, "")
    .trim();
}

export function isRule(sentence) {
  const plain = stripMarkers(sentence);
  return RULE_WORDS.test(plain) || IMPERATIVE.test(plain);
}

// Splits Markdown into blocks (paragraphs and list items), skipping fences, tables, headings, and HTML.
function blocks(markdown) {
  const out = [];
  let current = null;
  let fenced = false;
  markdown.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      current = null;
      return;
    }
    if (fenced || line.trim() === "" || /^\s*(#|\||<|>)/.test(line)) {
      current = null;
      return;
    }
    if (current === null || /^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      current = { line: index + 1, lines: [] };
      out.push(current);
    }
    current.lines.push(line.trim());
  });
  return out;
}

export function instructionRules(markdown) {
  const rules = [];
  for (const block of blocks(markdown)) {
    const joined = block.lines.join(" ");
    // starts[i] is the offset in `joined` where the block's line i begins.
    const starts = [];
    let offset = 0;
    for (const line of block.lines) {
      starts.push(offset);
      offset += line.length + 1;
    }
    let cursor = 0;
    for (const sentence of joined.split(/(?<=[.!?])\s+(?=[A-Z*`(])/)) {
      const at = joined.indexOf(sentence, cursor);
      cursor = at + sentence.length;
      const lineIndex = starts.findLastIndex((start) => start <= at);
      if (isRule(sentence))
        rules.push({ line: block.line + lineIndex, text: stripMarkers(sentence) });
    }
  }
  return rules;
}

export function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const pair = /^\s*([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (pair && !(pair[1] in fields)) fields[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
  }
  return { fields, body: text.slice(match[0].length) };
}

export function expandHome(path) {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function git(repo, args) {
  const run = spawnSync("git", ["--no-optional-locks", "-C", repo, ...args], { encoding: "utf8" });
  if (run.status !== 0)
    throw new Error(`git ${args.join(" ")} failed in ${repo}: ${run.stderr.trim()}`);
  return run.stdout;
}

function trackedFiles(repo) {
  return git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// Each check line is {path, line, text, kind}. Settings files contribute their deny rules and hook
// commands, plus the repository file a hook command runs.
export function checkLines(repo, tracked) {
  const lines = [];
  const scanned = new Set();
  const addFile = (path, kind) => {
    if (scanned.has(path)) return;
    const text = readText(join(repo, path));
    if (text === null || text.includes("\0")) return;
    scanned.add(path);
    text.split("\n").forEach((line, index) => {
      if (line.trim()) lines.push({ path, line: index + 1, text: line.trim(), kind });
    });
  };
  for (const path of tracked.filter((file) => basename(file) === "settings.json")) {
    let settings;
    try {
      settings = JSON.parse(readText(join(repo, path)));
    } catch {
      continue;
    }
    const raw = readText(join(repo, path)).split("\n");
    const lineOf = (needle) => raw.findIndex((line) => line.includes(JSON.stringify(needle))) + 1;
    for (const rule of settings?.permissions?.deny ?? []) {
      lines.push({ path, line: lineOf(rule), text: rule, kind: "deny" });
    }
    for (const groups of Object.values(settings?.hooks ?? {})) {
      for (const group of groups ?? []) {
        for (const hook of group?.hooks ?? []) {
          if (typeof hook?.command !== "string") continue;
          lines.push({ path, line: lineOf(hook.command), text: hook.command, kind: "hook" });
          const script = hook.command
            .split(/\s+/)[0]
            .replace(/^["']|["']$/g, "")
            .replace(/^(\$HOME|~|\$CLAUDE_PROJECT_DIR|\$\{CLAUDE_PROJECT_DIR\})\//, "");
          if (tracked.includes(script)) addFile(script, "hook");
        }
      }
    }
    scanned.add(path);
  }
  for (const [prefix, kind] of CHECK_DIRS) {
    for (const path of tracked.filter((file) => file.startsWith(prefix))) addFile(path, kind);
  }
  return { lines, files: [...scanned].sort() };
}

export function findChecks(spans, lines) {
  const hits = [];
  for (const span of spans) {
    for (const check of lines) {
      if (check.text.includes(span)) {
        hits.push({ ...check, text: check.text.slice(0, MAX_TEXT), span });
      }
    }
  }
  const unique = [...new Map(hits.map((hit) => [`${hit.path}:${hit.line}`, hit])).values()];
  return { checks: unique.slice(0, MAX_HITS), checkCount: unique.length };
}

function instructionFiles(repo, tracked) {
  const seen = new Map();
  for (const path of tracked.filter((file) => /^(AGENTS|CLAUDE)\.md$/.test(basename(file)))) {
    const full = join(repo, path);
    if (!existsSync(full)) continue;
    const real = realpathSync(full);
    if (!seen.has(real)) seen.set(real, relative(repo, real));
  }
  return [...seen.values()].sort();
}

function memoryFiles(memoryRoot) {
  if (!existsSync(memoryRoot)) return [];
  const files = [];
  for (const project of readdirSync(memoryRoot).sort()) {
    const dir = join(memoryRoot, project, "memory");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith(".md") && name !== "MEMORY.md") files.push(join(dir, name));
    }
  }
  return files;
}

export function memoryRule(path, text, lines) {
  const parsed = frontmatter(text);
  const fields = parsed?.fields ?? {};
  const type = /^\s*type:\s*(\S+)/m.exec(text)?.[1];
  if (NOT_RULES.has(type)) return null;
  const enforcedBy = fields["enforced-by"] || null;
  const rule = {
    source: "memory",
    file: path,
    project: basename(dirname(dirname(path))),
    name: fields.name || basename(path, ".md"),
    text: fields.description || "",
    enforcedBy,
  };
  if (enforcedBy) {
    return {
      ...rule,
      status: existsSync(expandHome(enforcedBy)) ? "enforced" : "stale",
      checks: [],
      checkCount: 0,
    };
  }
  const found = findChecks(codeSpans(text), lines);
  return { ...rule, status: found.checkCount ? "check-found" : "uncovered", ...found };
}

export function listRules({ repo, memoryRoot }) {
  const top = git(repo, ["rev-parse", "--show-toplevel"]).trim();
  const tracked = trackedFiles(top);
  const { lines, files } = checkLines(top, tracked);
  const rules = [];
  for (const file of instructionFiles(top, tracked)) {
    for (const rule of instructionRules(readText(join(top, file)))) {
      const found = findChecks(codeSpans(rule.text), lines);
      rules.push({
        source: "instruction",
        file,
        line: rule.line,
        text: rule.text,
        status: found.checkCount ? "check-found" : "uncovered",
        ...found,
      });
    }
  }
  for (const path of memoryFiles(memoryRoot)) {
    const rule = memoryRule(path, readText(path) ?? "", lines);
    if (rule) rules.push(rule);
  }
  return { repo: top, memoryRoot, checkFiles: files, rules };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n${USAGE}see ${DOC_PATH}\n`);
    return 2;
  }
  try {
    process.stdout.write(`${JSON.stringify(listRules(args), null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${SCRIPT}: ${error.message}\nsee ${DOC_PATH}\n`);
    return 1;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
