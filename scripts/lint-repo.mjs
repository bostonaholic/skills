#!/usr/bin/env node
// Checks the repository-level rules in AGENTS.md "Rules for changes" that a script can read, and
// prints one `path: rule N line L: message` line per violation.
//   node scripts/lint-repo.mjs  exit 1 when any rule breaks, 0 when all pass
// Rules: 7 every CHANGELOG.md bullet ends with a PR link whose label and URL carry the same
// number; 10 no em dash in repo-level Markdown (REPO_PROSE), outside the README generated block;
// 11 only the EVAL_SCRIPTS npm scripts run the eval suite, in package.json scripts and in
// .github/workflows/*.yml and *.yaml lines. Acts on the git repository at the working directory;
// files come from `git ls-files`. A missing or invalid package.json throws.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { README_END, README_START, REPO_URL } from "./catalog.mjs";

// Rule 10's repo-level prose. docs/plans/ quotes untrusted evidence, and skill and subagent files
// are shipped prompts that skill authoring governs, so neither is listed.
const REPO_PROSE =
  /^(?:AGENTS\.md|README\.md|INSTALL\.md|CHANGELOG\.md|docs\/[^/]+\.md|\.github\/.+\.md)$/;
const EM_DASH = "\u2014";
// The npm scripts that may run the eval suite, as Running the evals in docs/skill-authoring.md
// says. Each names an entry point whose NPM_SCRIPT guard admits only that script. No fixture
// depends on these names; a renamed entry point fails here and in its own guard.
const EVAL_SCRIPTS = ["eval", "eval:handoff"];
// Anything that starts an eval run: an eval npm script, an entry point, the claude subcommand, or
// the case tree.
const EVAL_PATTERN =
  /npm\s+run(?:-script)?\s+eval\b|scripts\/eval\.mjs|scripts\/eval-handoff\.mjs|plugin\s+eval\b|evals\//;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const BULLET = /^\s*[-*] /;
const PR_LINK_END = new RegExp(
  `\\[#(\\d+)\\]\\(${REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/\\1\\)$`,
);

function lsFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspecs], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

// Rule 7. A bullet runs from its `- ` line through the indented lines that continue it.
function checkChangelog(tracked, report) {
  if (!tracked.includes("CHANGELOG.md")) return report("CHANGELOG.md: rule 7: not tracked");
  const lines = readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!BULLET.test(line)) return;
    const parts = [line.trim()];
    for (let next = index + 1; next < lines.length; next++) {
      const continuation = lines[next];
      if (!/^\s+\S/.test(continuation) || BULLET.test(continuation)) break;
      parts.push(continuation.trim());
    }
    if (!PR_LINK_END.test(parts.join(" ")))
      report(
        `CHANGELOG.md: rule 7 line ${index + 1}: end the bullet with [#NNN](${REPO_URL}/pull/NNN), the PR number in both places`,
      );
  });
}

// Rule 10. In README.md the generated block holds skill descriptions, which skill authoring governs.
function checkEmDashes(tracked, report) {
  for (const path of tracked.filter((file) => REPO_PROSE.test(file))) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const start = path === "README.md" ? lines.indexOf(README_START) : -1;
    const end = path === "README.md" ? lines.indexOf(README_END) : -1;
    const generated = (index) => start !== -1 && end !== -1 && index > start && index < end;
    lines.forEach((line, index) => {
      if (line.includes(EM_DASH) && !generated(index))
        report(`${path}: rule 10 line ${index + 1}: replace the em dash`);
    });
  }
}

// Rule 11. A paid eval run may start only from an npm script a maintainer runs by hand.
function checkEvalRuns(tracked, report) {
  const message =
    "only the eval and eval:handoff npm scripts may run the eval suite (EVAL_SCRIPTS)";
  const raw = readFileSync("package.json", "utf8");
  const scripts = JSON.parse(raw).scripts ?? {};
  const lines = raw.split(/\r?\n/);
  const scriptsLine = lines.findIndex((line) => /^\s*"scripts"\s*:/.test(line));
  for (const [name, command] of Object.entries(scripts)) {
    if (EVAL_SCRIPTS.includes(name) || !EVAL_PATTERN.test(command)) continue;
    const key = `${JSON.stringify(name)}:`;
    const index = lines.findIndex(
      (line, at) => at > scriptsLine && line.trimStart().startsWith(key),
    );
    report(`package.json: rule 11 line ${index + 1}: ${message}`);
  }
  for (const path of tracked.filter((file) => WORKFLOW.test(file))) {
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (EVAL_PATTERN.test(line)) report(`${path}: rule 11 line ${index + 1}: ${message}`);
      });
  }
}

// Returns every violation as "path: rule N line L: message".
export function lintRepo() {
  const problems = [];
  const report = (line) => problems.push(line);
  const tracked = lsFiles();
  checkChangelog(tracked, report);
  checkEmDashes(tracked, report);
  checkEvalRuns(tracked, report);
  return problems;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error(`usage: node scripts/${basename(process.argv[1])}`);
    process.exit(1);
  }
  const problems = lintRepo();
  if (problems.length) {
    console.error(
      `${problems.join("\n")}\n${problems.length} problem(s). See AGENTS.md "Rules for changes".`,
    );
    process.exit(1);
  }
}
