#!/usr/bin/env node

/**
 * Writes `<out>/manifest.md` from the frames the caller kept and prunes `<out>`
 * down to that manifest, deleting only files this run or the previous manifest
 * listed.
 *
 *     node "<skill-dir>/scripts/finalize.mjs" <out> <frames.json> [<shoot.json>...] [--date YYYY-MM-DD]
 *
 * `<frames.json>`:
 *
 *     {
 *       "topic": "settings screens",
 *       "seeded": false,
 *       "seed_note": "no seed script; used the empty dev database",
 *       "skip": "no-tool" | "server-start",
 *       "frames": [{ "name": "01-settings-populated", "route": "/settings", "state": "populated",
 *                    "caption": "...", "verdict": "verified" | "not visually verified" }],
 *       "skipped": [{ "shot": "/settings error", "reason": "...", "name": "02-settings-error" }]
 *     }
 *
 * `seed_note` is required when `seeded` is false and refused when it is true.
 * `skip` is present only when nothing was shot; `frames` must then be empty.
 * A skipped entry carries `name` when its PNG was written and then rejected.
 * Each `<shoot.json>` is one `shoot.mjs` report, in run order; the last report
 * naming a frame decides it.
 *
 * Status: `skip` gives skipped-no-tool or skipped-server-start; otherwise
 * captured when nothing was skipped, partial when something was.
 *
 * Deletes `<out>/<name>.png` for each name a shoot report wrote, a skipped
 * entry names, or the previous manifest lists, when the new manifest does not
 * list it. Only names matching the shot-name pattern are deleted, so nothing
 * outside `<out>` and no unlisted file is ever touched. A rerun is a no-op.
 *
 * Prints `{"status", "deleted", "stray", "missing"}` (sorted file names).
 * Exit 0: manifest written, `<out>` holds only it and its PNGs.
 * 1: `missing` lists a kept frame with no PNG (nothing written or deleted), or
 * `stray` lists files neither run nor manifest listed (left in place).
 * 2: bad usage, unreadable or invalid input, or a frame that contradicts a
 * shoot report; nothing written or deleted.
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** Same pattern shoot.mjs enforces: no slash or dot, so a name cannot leave `<out>`. */
const NAME = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MANIFEST = "manifest.md";
const VERDICTS = ["verified", "not visually verified"];
const SKIPS = { "no-tool": "skipped-no-tool", "server-start": "skipped-server-start" };
const INPUT_KEYS = new Set(["topic", "seeded", "seed_note", "skip", "frames", "skipped"]);
const FRAME_KEYS = ["name", "route", "state", "caption", "verdict"];

export class InputError extends Error {}

function fail(where, message) {
  throw new InputError(`${where}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** One non-empty line, so no value can break the frontmatter or the list layout. */
function line(value, where) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value))
    fail(where, "must be a non-empty single-line string");
  return value;
}

function shotName(value, where) {
  if (typeof value !== "string" || !NAME.test(value))
    fail(where, "must match NN-lowercase-words, such as 01-settings-empty");
  return value;
}

/** Validates frames.json and returns it normalized. */
export function parseFrames(input) {
  if (!isObject(input)) fail("frames.json", "must be a JSON object");
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) fail(key, "unknown field");
  line(input.topic, "topic");
  if (typeof input.seeded !== "boolean") fail("seeded", "must be true or false");
  if (input.seeded && "seed_note" in input) fail("seed_note", "only when seeded is false");
  if (!input.seeded) line(input.seed_note, "seed_note");
  if ("skip" in input && !(input.skip in SKIPS))
    fail("skip", `must be one of ${Object.keys(SKIPS).join(", ")}`);
  if (!Array.isArray(input.frames)) fail("frames", "must be an array");
  const skipped = input.skipped ?? [];
  if (!Array.isArray(skipped)) fail("skipped", "must be an array");

  const names = new Set();
  const unique = (name, where) => {
    if (names.has(name)) fail(where, "duplicate name");
    names.add(name);
  };
  const frames = input.frames.map((frame, index) => {
    const where = `frames[${index}]`;
    if (!isObject(frame)) fail(where, "must be an object");
    for (const key of Object.keys(frame))
      if (!FRAME_KEYS.includes(key)) fail(`${where}.${key}`, "unknown field");
    shotName(frame.name, `${where}.name`);
    unique(frame.name, `${where}.name`);
    for (const key of ["route", "state", "caption"]) line(frame[key], `${where}.${key}`);
    if (!VERDICTS.includes(frame.verdict))
      fail(`${where}.verdict`, `must be one of ${VERDICTS.join(", ")}`);
    return { ...frame };
  });
  const skips = skipped.map((skip, index) => {
    const where = `skipped[${index}]`;
    if (!isObject(skip)) fail(where, "must be an object");
    for (const key of Object.keys(skip))
      if (!["shot", "reason", "name"].includes(key)) fail(`${where}.${key}`, "unknown field");
    line(skip.shot, `${where}.shot`);
    line(skip.reason, `${where}.reason`);
    if ("name" in skip) {
      shotName(skip.name, `${where}.name`);
      unique(skip.name, `${where}.name`);
    }
    return { ...skip };
  });

  if (input.skip && frames.length) fail("frames", "must be empty when skip is set");
  if (!input.skip && !frames.length && !skips.length)
    fail("frames", "nothing captured or skipped; set skip or list the skipped shots");
  return { ...input, frames, skipped: skips };
}

/** Reduces shoot.mjs reports, in run order, to each frame's last result. */
export function lastResults(reports) {
  const results = new Map();
  reports.forEach((report, index) => {
    const where = `shoot report ${index + 1}`;
    if (!isObject(report) || !Array.isArray(report.frames)) fail(where, "has no frames array");
    for (const frame of report.frames) {
      if (!isObject(frame) || typeof frame.ok !== "boolean") fail(where, "frame without ok");
      results.set(shotName(frame.name, `${where} frame name`), frame.ok);
    }
  });
  return results;
}

/** Fails when the kept frames disagree with the shoot reports or leave a shot unaccounted for. */
export function checkAgainstReports(parsed, results) {
  const kept = new Set(parsed.frames.map((frame) => frame.name));
  const skippedNames = new Set(parsed.skipped.map((skip) => skip.name).filter(Boolean));
  for (const [name, ok] of results) {
    if (kept.has(name) && !ok) fail(name, "failed in its last shoot report; skip it instead");
    if (!kept.has(name) && !skippedNames.has(name))
      fail(name, "is in a shoot report but neither in frames nor skipped");
  }
}

export function statusOf(parsed) {
  if (parsed.skip) return SKIPS[parsed.skip];
  return parsed.skipped.length ? "partial" : "captured";
}

/** Names listed under `### <name>.png` in a previous manifest; anything not a shot name is ignored, never deleted. */
export function previousNames(text) {
  const names = [];
  for (const match of text.matchAll(/^### (.+)\.png$/gm))
    if (NAME.test(match[1])) names.push(match[1]);
  return names;
}

export function renderManifest(parsed, date) {
  const front = [
    "---",
    `topic: ${parsed.topic}`,
    `date: ${date}`,
    `status: ${statusOf(parsed)}`,
    `seeded: ${parsed.seeded}`,
    ...(parsed.seeded ? [] : [`seed_note: ${parsed.seed_note}`]),
    "---",
  ];
  const captured = parsed.frames.length
    ? parsed.frames.flatMap((frame) => [
        `### ${frame.name}.png`,
        "",
        `- route: ${frame.route}`,
        `- state: ${frame.state}`,
        `- caption: ${frame.caption}`,
        `- verdict: ${frame.verdict}`,
        "",
      ])
    : ["- none", ""];
  const skipped = parsed.skipped.length
    ? parsed.skipped.map((skip) => `- ${skip.shot}: ${skip.reason}`)
    : ["- none"];
  return [...front, "", "## Captured", "", ...captured, "## Skipped", "", ...skipped, ""].join(
    "\n",
  );
}

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(path, `unreadable JSON: ${String(error.message).split("\n")[0]}`);
  }
}

function parseArgs(argv) {
  const positional = [];
  let date = null;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--date") {
      date = argv[++index];
      if (!date || !DATE.test(date)) fail("--date", "must be YYYY-MM-DD");
    } else positional.push(argv[index]);
  }
  const [out, framesPath, ...shootPaths] = positional;
  if (!out || !framesPath) return null;
  return { out: resolve(out), framesPath, shootPaths, date: date ?? today() };
}

/** Removes `<out>/<name>.png` when it is a file or link; returns whether it existed. */
function removeFrame(out, name) {
  const path = join(out, `${name}.png`);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return false;
  }
  if (!stat.isFile() && !stat.isSymbolicLink()) return false;
  unlinkSync(path);
  return true;
}

export function finalize({ out, framesPath, shootPaths, date }) {
  if (!existsSync(out) || !statSync(out).isDirectory()) fail(out, "is not a directory");
  const parsed = parseFrames(readJson(framesPath));
  const reports = shootPaths.map(readJson);
  checkAgainstReports(parsed, lastResults(reports));
  const manifestPath = join(out, MANIFEST);
  const previous = existsSync(manifestPath)
    ? previousNames(readFileSync(manifestPath, "utf8"))
    : [];
  const status = statusOf(parsed);
  const kept = new Set(parsed.frames.map((frame) => frame.name));

  const missing = [...kept]
    .filter((name) => {
      try {
        return !lstatSync(join(out, `${name}.png`)).isFile();
      } catch {
        return true;
      }
    })
    .map((name) => `${name}.png`)
    .sort();
  if (missing.length) return { status, deleted: [], stray: [], missing };

  const temporary = `${manifestPath}.${process.pid}.tmp`;
  writeFileSync(temporary, renderManifest(parsed, date));
  renameSync(temporary, manifestPath);

  const listed = new Set([
    ...reports.flatMap((report) =>
      report.frames.filter((frame) => frame.ok).map((frame) => frame.name),
    ),
    ...parsed.skipped.map((skip) => skip.name).filter(Boolean),
    ...previous,
  ]);
  const deleted = [...listed]
    .filter((name) => !kept.has(name) && removeFrame(out, name))
    .map((name) => `${name}.png`)
    .sort();

  const allowed = new Set([MANIFEST, ...[...kept].map((name) => `${name}.png`)]);
  const stray = readdirSync(out)
    .filter((entry) => !allowed.has(entry))
    .sort();
  return { status, deleted, stray, missing: [] };
}

function main(argv) {
  let options;
  let result;
  try {
    options = parseArgs(argv);
    if (!options) {
      process.stderr.write(
        "finalize.mjs: usage: finalize.mjs <out> <frames.json> [<shoot.json>...] [--date YYYY-MM-DD]\n",
      );
      process.stderr.write(`see ${DOC_PATH}\n`);
      return 2;
    }
    result = finalize(options);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    process.stderr.write(`finalize.mjs: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.missing.length || result.stray.length ? 1 : 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
