#!/usr/bin/env node
// Writes `enforced-by: <check>` into a memory file's frontmatter, replacing any earlier value, only when
// <check> exists on disk.
// Usage: mark-enforced.mjs <memory.md> <check>
//   <check>  an absolute or ~/ path to the hook, test, workflow, or settings file that enforces the rule
//   exit 0  wrote the line and printed the memory file's path
//   exit 1  wrote nothing; stderr names the failure: <check> is relative or missing, or <memory.md>
//           cannot be read or has no frontmatter
//   exit 2  bad arguments; stderr prints the usage line
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "mark-enforced.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <memory.md> <check>\n`;

export function setEnforcedBy(text, check) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error("has no frontmatter");
  const kept = match[1].split("\n").filter((line) => !line.startsWith("enforced-by:"));
  return `---\n${[...kept, `enforced-by: ${check}`].join("\n")}\n---\n${text.slice(match[0].length)}`;
}

function resolveCheck(check) {
  if (check.startsWith("~/")) return join(homedir(), check.slice(2));
  return isAbsolute(check) ? check : null;
}

function main(argv) {
  if (argv.length !== 2 || argv.some((arg) => !arg || arg.startsWith("-"))) {
    process.stderr.write(`${USAGE}see ${DOC_PATH}\n`);
    return 2;
  }
  const [memory, check] = argv;
  const fail = (message) => {
    process.stderr.write(`${SCRIPT}: ${message}\nsee ${DOC_PATH}\n`);
    return 1;
  };
  const resolved = resolveCheck(check);
  if (resolved === null) return fail(`${check} is relative; pass an absolute or ~/ path`);
  if (!existsSync(resolved)) return fail(`${check} does not exist; add the check first`);
  let text;
  try {
    text = readFileSync(memory, "utf8");
  } catch {
    return fail(`cannot read ${memory}`);
  }
  try {
    writeFileSync(memory, setEnforcedBy(text, check));
  } catch (error) {
    return fail(`${memory} ${error.message}`);
  }
  process.stdout.write(`${memory}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
