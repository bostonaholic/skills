#!/usr/bin/env node
// Applies the model's breaking notes to analyze.mjs output and prints the plan table.
//
// Usage: render-plan.mjs <analysis.json> [<notes.json>]
//   <analysis.json>  analyze.mjs stdout, saved to a file
//   <notes.json>     optional object {"<pr-number>": "<one-line note>"}: a quoted breaking note,
//                    usage hits, or both. A note on a PR whose needsNotes is true applies the
//                    breaking-note row: that PR becomes "skip: breaking: <note>". Any other
//                    note only fills the Notes column.
//
// Stdout, merge mode: a Markdown table with the header
//   | PR | Update | Level | CI | Merge state | Security | Notes | Decision |
//   ordered security yes first, then patch, then minor, then the rest; ascending PR number
//   within each group. Then one line per actionable row, ascending: `act <number> <head> merge`
//   or `act <number> <head> rebase`, the arguments act.mjs takes.
// Stdout, rebase-only mode: | PR | Title | Action | Reason |, ascending PR number, then one
//   `act <number> <head> rebase` line per rebase row.
// Cell text has `|` escaped and newlines folded to spaces.
//
// Exit codes:
//   0  plan printed
//   1  an input is unreadable, not JSON, or malformed (stderr names it)
//   2  usage: wrong argument count
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMain } from "./lib.mjs";

const SCRIPT = "render-plan.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const GROUP_ORDER = ["security", "patch", "minor", "rest"];

const cell = (value) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");

function group(pr) {
  if (pr.security === "yes") return "security";
  return pr.level === "patch" || pr.level === "minor" ? pr.level : "rest";
}

/** Applies the breaking-note row, returning PRs with final decision and reason. */
export function applyNotes(prs, notes) {
  return prs.map((pr) => {
    const note = notes[String(pr.number)] ?? "";
    if (note && pr.needsNotes) {
      return { ...pr, note, decision: "skip", reason: `breaking: ${note}` };
    }
    return { ...pr, note };
  });
}

function decisionCell({ decision, reason }) {
  return reason && decision !== "merge" && decision !== "rebase"
    ? `${decision}: ${reason}`
    : decision;
}

function securityCell({ security, advisories }) {
  if (security !== "yes") return security;
  return `yes ${advisories.map((a) => `${a.ghsa} (${a.severity})`).join(", ")}`;
}

function actLines(prs) {
  return prs
    .filter((pr) => pr.decision === "merge" || pr.decision === "rebase")
    .sort((a, b) => a.number - b.number)
    .map((pr) => `act ${pr.number} ${pr.head} ${pr.decision}`);
}

export function renderMerge(prs) {
  const rows = [...prs].sort(
    (a, b) => GROUP_ORDER.indexOf(group(a)) - GROUP_ORDER.indexOf(group(b)) || a.number - b.number,
  );
  const lines = [
    "| PR | Update | Level | CI | Merge state | Security | Notes | Decision |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((pr) => {
      const update = pr.pairs.length
        ? pr.pairs.map((p) => `${p.pkg} ${p.from} to ${p.to}`).join("; ")
        : pr.title;
      return `| #${pr.number} | ${[update, pr.level, pr.ci, pr.mergeState, securityCell(pr), pr.note, decisionCell(pr)].map(cell).join(" | ")} |`;
    }),
  ];
  return [...lines, "", ...actLines(prs)].join("\n");
}

export function renderRebaseOnly(prs) {
  const rows = [...prs].sort((a, b) => a.number - b.number);
  const lines = [
    "| PR | Title | Action | Reason |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (pr) => `| #${pr.number} | ${[pr.title, pr.decision, pr.reason].map(cell).join(" | ")} |`,
    ),
  ];
  return [...lines, "", ...actLines(prs)].join("\n");
}

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${label} ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} ${path} is not JSON`);
  }
}

function validate(analysis, notes) {
  if (!["merge", "rebase-only"].includes(analysis?.mode) || !Array.isArray(analysis.prs)) {
    throw new Error('analysis must be analyze.mjs output: {"mode", "prs": [...]}');
  }
  if (notes === null || typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("notes must be a JSON object keyed by PR number");
  }
  const numbers = new Set(analysis.prs.map((pr) => String(pr.number)));
  for (const [key, value] of Object.entries(notes)) {
    if (!numbers.has(key)) throw new Error(`notes name PR ${key}, which is not in the analysis`);
    if (typeof value !== "string") throw new Error(`the note for PR ${key} is not a string`);
  }
}

function main(argv) {
  if (argv.length < 1 || argv.length > 2) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} <analysis.json> [<notes.json>]\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  try {
    const analysis = readJson(argv[0], "analysis");
    const notes = argv[1] ? readJson(argv[1], "notes") : {};
    validate(analysis, notes);
    const prs = applyNotes(analysis.prs, notes);
    const out = analysis.mode === "merge" ? renderMerge(prs) : renderRebaseOnly(prs);
    process.stdout.write(`${out}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
