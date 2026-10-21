#!/usr/bin/env node
// Scores verified audit findings: points, letter grade, and safe-to-run verdict.
//
// Usage: score.mjs < findings.json
//
// Stdin: a JSON array of { "id": "F1", "severity": "Critical" | "High" |
// "Medium" | "Low" }, one entry per verified finding. An empty array is valid.
//
// Stdout: one JSON object:
//   score             100 minus every finding's points, floored at 0
//   grade             A, B, C, D, or F
//   safeToRun         NO with any Critical, CONDITIONAL with any High, else YES
//   countsBySeverity  { Critical, High, Medium, Low }
//
// Exit codes:
//   0  scored
//   1  stdin is not JSON, not an array, or holds an entry with a missing or
//      repeated id or an unknown severity; stderr names each problem
//   2  usage error: arguments given (the findings come on stdin)
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The points table in references/report-format.md.
export const POINTS = { Critical: 25, High: 10, Medium: 5, Low: 2 };

// Lowest score for each grade, highest grade first; anything lower is F.
const GRADE_FLOORS = [
  ["A", 90],
  ["B", 80],
  ["C", 70],
  ["D", 60],
];

export function validate(findings) {
  if (!Array.isArray(findings)) return ["findings must be a JSON array"];
  const errors = [];
  const seen = new Set();
  findings.forEach((finding, index) => {
    const id = finding?.id;
    if (typeof id !== "string" || id.trim() === "") {
      errors.push(`finding ${index}: id is required`);
    } else if (seen.has(id)) {
      errors.push(`finding ${index}: id ${id} is repeated`);
    } else {
      seen.add(id);
    }
    if (!Object.hasOwn(POINTS, finding?.severity)) {
      errors.push(
        `finding ${index}: severity must be one of ${Object.keys(POINTS).join(", ")}, not ${JSON.stringify(finding?.severity)}`,
      );
    }
  });
  return errors;
}

export function score(findings) {
  const countsBySeverity = Object.fromEntries(Object.keys(POINTS).map((name) => [name, 0]));
  for (const { severity } of findings) countsBySeverity[severity] += 1;
  const lost = findings.reduce((sum, { severity }) => sum + POINTS[severity], 0);
  const total = Math.max(0, 100 - lost);
  const grade = GRADE_FLOORS.find(([, floor]) => total >= floor)?.[0] ?? "F";
  const safeToRun = countsBySeverity.Critical
    ? "NO"
    : countsBySeverity.High
      ? "CONDITIONAL"
      : "YES";
  return { score: total, grade, safeToRun, countsBySeverity };
}

function main(args) {
  if (args.length) {
    console.error("score.mjs: usage: score.mjs < findings.json");
    return 2;
  }
  let findings;
  try {
    findings = JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    console.error(`score.mjs: stdin is not JSON: ${error.message}`);
    return 1;
  }
  const errors = validate(findings);
  if (errors.length) {
    for (const error of errors) console.error(`score.mjs: ${error}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(score(findings))}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
