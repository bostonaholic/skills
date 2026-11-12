#!/usr/bin/env node
// Reads the improving-codebases lane registry: every brief in references/lanes/, parsed and checked.
// Usage: list-lanes.mjs
//   exit 0  printed a JSON array of lanes, in file-name order
//   exit 1  a brief is malformed, or references/lanes/ holds no brief; stderr lists every error
//   exit 2  any argument; stderr prints the usage line
// Imports only node: modules, so the file runs wherever it is copied beside a references/lanes/.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const LANES_DIR = fileURLToPath(new URL("../references/lanes/", import.meta.url));

export const LANE_KEYS = Object.freeze([
  "lane",
  "summary",
  "makes",
  "report",
  "evidence",
  "checks",
  "artifacts",
]);
const LIST_KEYS = new Set(["evidence", "checks", "artifacts"]);
// A finding id is <lane>/<n>, and checkpoint.mjs turns it into a directory name.
const LANE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function heading(body, name) {
  return new RegExp(`^## ${name}[ \\t]*$`, "m").test(body);
}

// Parses `key: value` lines. A list key splits on commas, and a key with no value is an empty list.
function parseFrontmatter(text) {
  const fields = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-z]+):[ \t]*(.*)$/);
    if (match) fields.set(match[1], match[2].trim());
  }
  return fields;
}

const splitList = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// Returns one lane object or the errors of the brief at `file` with the given stem.
function readBrief(file, stem, text) {
  const errors = [];
  const match = text.match(FRONTMATTER);
  if (!match) return { errors: [`${file}: no frontmatter between --- lines`] };
  const fields = parseFrontmatter(match[1]);
  const body = text.slice(match[0].length);
  for (const key of LANE_KEYS) {
    if (!fields.has(key)) errors.push(`${file}: missing key ${key}`);
  }
  const lane = fields.get("lane");
  if (lane !== undefined && lane !== stem)
    errors.push(`${file}: lane ${lane} does not match the file name ${stem}`);
  if (!LANE_NAME.test(stem))
    errors.push(`${file}: the file name ${stem} must be lowercase letters, digits, and hyphens`);
  const makes = fields.get("makes");
  if (makes !== undefined && makes !== "true" && makes !== "false")
    errors.push(`${file}: makes must be true or false, not ${makes || "empty"}`);
  if (!heading(body, "Find")) errors.push(`${file}: missing ## Find`);
  const report = fields.get("report");
  if (report !== undefined && report !== "findings" && report !== "own")
    errors.push(`${file}: report must be findings or own, not ${report || "empty"}`);
  // A report lane writes its own report, so nothing it finds may feed the main one.
  if (report === "own") {
    if (makes === "true") errors.push(`${file}: report is own, so makes must be false`);
    if (!heading(body, "Report"))
      errors.push(`${file}: report is own, so it needs ## Report; missing ## Report`);
    if ([...LIST_KEYS].some((key) => splitList(fields.get(key) ?? "").length > 0))
      errors.push(`${file}: report is own, so evidence, checks, and artifacts stay empty`);
  }
  if (makes === "true") {
    if (!heading(body, "Make"))
      errors.push(`${file}: makes is true, so it needs ## Make; missing ## Make`);
    if (!heading(body, "Review"))
      errors.push(`${file}: makes is true, so it needs ## Review; missing ## Review`);
  }
  if (errors.length > 0) return { errors };
  const value = (key) => (LIST_KEYS.has(key) ? splitList(fields.get(key)) : fields.get(key));
  return {
    errors,
    lane: {
      lane: stem,
      summary: value("summary"),
      makes: makes === "true",
      report,
      evidence: value("evidence"),
      checks: value("checks"),
      artifacts: value("artifacts"),
    },
  };
}

// Returns { lanes, errors } for every .md brief in `lanesDir`, in file-name order.
export function listLanes(lanesDir = LANES_DIR) {
  let names;
  try {
    names = readdirSync(lanesDir).filter((name) => name.endsWith(".md"));
  } catch (error) {
    return { lanes: [], errors: [`cannot read ${lanesDir}: ${error.message}`] };
  }
  if (names.length === 0) return { lanes: [], errors: [`no lane briefs in ${lanesDir}`] };
  const lanes = [];
  const errors = [];
  for (const name of names.sort()) {
    const file = join(lanesDir, name);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      errors.push(`cannot read ${file}: ${error.message}`);
      continue;
    }
    const brief = readBrief(file, name.slice(0, -".md".length), text);
    errors.push(...brief.errors);
    if (brief.lane) lanes.push(brief.lane);
  }
  return { lanes, errors };
}

function main(args) {
  if (args.length > 0) {
    process.stderr.write("list-lanes.mjs: usage: list-lanes.mjs (takes no arguments)\n");
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  const { lanes, errors } = listLanes();
  if (errors.length > 0) {
    process.stderr.write(`list-lanes.mjs: ${errors.length} error(s) in the lane registry\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(lanes, null, 2)}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
