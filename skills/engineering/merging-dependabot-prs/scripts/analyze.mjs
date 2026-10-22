#!/usr/bin/env node
// Reads open Dependabot PRs and applies every decision-table row except the breaking-note row.
//
// Usage: analyze.mjs [--rebase-only] [<pr-number>...]
//   With no numbers, reads every open PR by app/dependabot (at most LIST_LIMIT). Requires gh,
//   signed in, run inside the target repository's checkout.
//
// Stdout: one JSON object, PRs in ascending number order:
//   {"mode": "merge" | "rebase-only", "prs": [
//     {number, title, state, author, isDraft, head, mergeState, editedBy[],
//      pairs[{pkg, from, to, level, grepSafe, upstreamRepo, tag}], level, ci,
//      security, advisories[{ghsa, severity}], decision, reason, needsNotes}]}
//   level: patch | minor | major | unknown. ci: pass | fail | pending | none.
//   security: yes | no | unknown (alerts unreadable, or branch ecosystem not mapped).
//   upstreamRepo and tag come from the pair's compare link; null when missing or when they fail
//   the skill's allowlists. grepSafe is false when pkg fails the package allowlist.
//   decision: merge | rebase | skip; needsNotes marks patch and minor PRs the breaking-note row
//   can still turn into skip. In rebase-only mode, decision is rebase | needs-recreate | skip,
//   pairs is empty, and level, ci, and security are null.
// Stderr: a warning when the list returns exactly LIST_LIMIT PRs, and every error.
//
// Exit codes:
//   0    analysis printed
//   1    a gh read failed (stderr names it); nothing printed
//   2    usage: unknown flag or a PR argument that is not all digits
//   3    the repository disallows squash merges (merge mode only)
//   127  gh not found on PATH
import { fileURLToPath } from "node:url";
import {
  GhError,
  PR_NUMBER_PATTERN,
  decide,
  decideRebaseOnly,
  ecosystemOf,
  isMain,
  matchAdvisories,
  maxLevel,
  parsePairs,
  readCi,
  readPr,
  runGh,
  writeToolError,
} from "./lib.mjs";

const SCRIPT = "analyze.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
// Dependabot's open-PR limit defaults to 5 per ecosystem, so 200 covers any realistic
// backlog; a list exactly this long may have been cut off.
const LIST_LIMIT = 200;
const ALERT_FIELDS =
  '.[] | [.dependency.package.ecosystem, .dependency.package.name, .security_advisory.ghsa_id, .security_advisory.severity, (.security_vulnerability.first_patched_version.identifier // "")] | @tsv';

function usage() {
  process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} [--rebase-only] [<pr-number>...]\n`);
  process.stderr.write(`see ${DOC_PATH}\n`);
  return 2;
}

function squashAllowed() {
  const run = runGh(["repo", "view", "--json", "squashMergeAllowed"]);
  if (run.status !== 0) {
    writeToolError(run.stderr);
    throw new GhError(`gh repo view exited ${run.status}`);
  }
  return JSON.parse(run.stdout).squashMergeAllowed === true;
}

function listNumbers() {
  const run = runGh([
    "pr",
    "list",
    "--author",
    "app/dependabot",
    "--state",
    "open",
    "--limit",
    String(LIST_LIMIT),
    "--json",
    "number",
  ]);
  if (run.status !== 0) {
    writeToolError(run.stderr);
    throw new GhError(`gh pr list exited ${run.status}`);
  }
  const numbers = JSON.parse(run.stdout).map((pr) => String(pr.number));
  if (numbers.length === LIST_LIMIT) {
    process.stderr.write(
      `${SCRIPT}: warning: gh pr list returned exactly ${LIST_LIMIT} PRs; the list may be truncated\n`,
    );
  }
  return numbers;
}

/** Open alerts as `{ecosystem, pkg, ghsa, severity, firstPatched}`, or null on HTTP 403 or 404. */
function readAlerts() {
  const run = runGh([
    "api",
    "repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100",
    "--paginate",
    "--jq",
    ALERT_FIELDS,
  ]);
  if (run.status !== 0) {
    if (/\(HTTP 40[34]\)/.test(run.stderr)) return null;
    writeToolError(run.stderr);
    throw new GhError(`gh api dependabot/alerts exited ${run.status}`);
  }
  return run.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ecosystem, pkg, ghsa, severity, firstPatched] = line.split("\t");
      return { ecosystem, pkg, ghsa, severity, firstPatched };
    });
}

function analyzeMerge(numbers) {
  const alerts = readAlerts();
  return numbers.map((number) => {
    const pr = readPr(number);
    const pairs = parsePairs(pr.title, pr.body);
    const level = maxLevel(pairs);
    const ci = readCi(number);
    const { security, advisories } = matchAdvisories(alerts, ecosystemOf(pr.branch), pairs);
    return {
      ...summary(pr),
      pairs,
      level,
      ci,
      security,
      advisories,
      ...decide({ ...pr, level, ci }),
    };
  });
}

function analyzeRebaseOnly(numbers) {
  return numbers.map((number) => {
    const pr = readPr(number);
    return {
      ...summary(pr),
      pairs: [],
      level: null,
      ci: null,
      security: null,
      advisories: [],
      ...decideRebaseOnly(pr),
      needsNotes: false,
    };
  });
}

function summary({ number, title, state, author, isDraft, head, mergeState, editedBy }) {
  return { number, title, state, author, isDraft, head, mergeState, editedBy };
}

function main(argv) {
  const rebaseOnly = argv.includes("--rebase-only");
  const numbers = argv.filter((arg) => arg !== "--rebase-only");
  if (numbers.some((arg) => !PR_NUMBER_PATTERN.test(arg))) return usage();

  try {
    if (!rebaseOnly && !squashAllowed()) {
      process.stderr.write(`${SCRIPT}: the repository disallows squash merges\n`);
      process.stderr.write(`see ${DOC_PATH}\n`);
      return 3;
    }
    const targets = numbers.length > 0 ? [...new Set(numbers)] : listNumbers();
    targets.sort((a, b) => Number(a) - Number(b));
    const prs = rebaseOnly ? analyzeRebaseOnly(targets) : analyzeMerge(targets);
    process.stdout.write(
      `${JSON.stringify({ mode: rebaseOnly ? "rebase-only" : "merge", prs }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof GhError) && !(error instanceof SyntaxError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return error.missing ? 127 : 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
