#!/usr/bin/env node
// Validates an improving-codebases report.json against the lane registry and the repository, then
// writes report.json and report.md into the output directory.
// Usage: render-report.mjs <report.json> <out>
//   exit 0  wrote <out>/report.json and <out>/report.md and printed the report.md path, or found no
//           findings, printed `no findings`, and wrote nothing
//   exit 1  wrote nothing; stderr names an unreadable report.json, a malformed lane registry, a git
//           failure, every validation error, or an <out> file that is a symlink or another
//           skill's report
//   exit 2  not exactly two arguments; stderr prints the usage line
// Citations are tested at scope.commit through git, because a refactor moves lines in the tree.
// <run> is the directory of report.json's real path. Each check result sits under it, and the
// renderer reads that file for the status, so a status typed into report.json never counts.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listLanes } from "./list-lanes.mjs";
import { childEnv } from "./run-bounded.mjs";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

export const SKILL = "improving-codebases";
export const OUTCOMES = Object.freeze(["applied", "proposed", "reported", "deferred"]);
// The outcomes a make step ends in, which carry its artifacts and check results.
const MADE = new Set(["applied", "proposed"]);
const APPLIED_REVIEWS = new Set(["confirmed", "not-run"]);
export const REVIEW_STATUSES = Object.freeze(["confirmed", "refuted", "inconclusive", "not-run"]);
export const CHECK_STATUSES = Object.freeze(["pass", "fail", "not-run"]);
// A fence needs more backticks than any run inside the text it fences.
const MIN_FENCE = 3;
const FINDING_ID = /^([a-z0-9-]+)\/([1-9][0-9]*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_NUMBER = /^[1-9][0-9]*$/;
// git output and blobs can pass spawnSync's 1 MiB default buffer on a large repository.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const NEWLINE = 0x0a;

const filled = (value) => typeof value === "string" && value.trim() !== "";
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// True when `path` is `root` or sits under it. The root `.` holds every path.
export function underPath(path, root) {
  const base = String(root).replace(/\/+$/, "");
  if (base === "." || base === "") return true;
  return path === base || path.startsWith(`${base}/`);
}

// A repository-relative path: not absolute, and no `..` segment.
function relativePath(path) {
  return (
    filled(path) && !path.startsWith("/") && !path.includes("\0") && !path.split("/").includes("..")
  );
}

// Splits `path:line` on its last colon, so a path that holds a colon still parses.
function parseCitation(citation) {
  if (typeof citation !== "string") return null;
  const at = citation.lastIndexOf(":");
  if (at <= 0) return null;
  const path = citation.slice(0, at);
  const line = citation.slice(at + 1);
  if (!LINE_NUMBER.test(line) || !relativePath(path) || path === ".") return null;
  return { path, line: Number(line) };
}

function citationProblem(citation, scope, facts) {
  const parsed = parseCitation(citation);
  if (!parsed) return "is not a repository-relative path:line";
  if (!list(scope.paths).some((root) => underPath(parsed.path, root)))
    return "sits outside scope.paths";
  if (list(scope.dirty).some((dirty) => underPath(parsed.path, dirty))) return null;
  const count = facts.lines[parsed.path];
  if (count === undefined || count === null) return "names a file absent at scope.commit";
  if (parsed.line > count)
    return `runs past the end of ${parsed.path}, which has ${count} lines at scope.commit`;
  return null;
}

function citedPaths(report) {
  const paths = new Set();
  for (const finding of list(report?.findings)) {
    if (!isObject(finding)) continue;
    const citations = [
      ...list(finding.citations),
      ...list(finding.evidence).map((item) => item?.citation),
    ];
    for (const citation of citations) {
      const parsed = parseCitation(citation);
      if (parsed) paths.add(parsed.path);
    }
  }
  return paths;
}

function validateScope(scope, facts, errors) {
  for (const field of ["root", "commit"]) {
    if (!filled(scope[field])) errors.push(`scope.${field} is required`);
  }
  if (!DATE.test(String(scope.date ?? ""))) errors.push("scope.date must be YYYY-MM-DD");
  if (list(scope.paths).length === 0)
    errors.push("scope.paths must name at least one path; use . for the whole repository");
  for (const path of list(scope.paths)) {
    if (!relativePath(path)) errors.push(`scope.paths entry ${path} is not repository-relative`);
  }
  if (!Array.isArray(scope.dirty)) errors.push("scope.dirty must be a list, empty when clean");
  if (filled(scope.commit) && facts.head !== scope.commit)
    errors.push(
      `HEAD moved: HEAD is ${facts.head}, not scope.commit ${scope.commit}; give the findings in the reply and name what moved`,
    );
}

function validateGroups(report, facts, errors) {
  const ids = new Set();
  const placed = new Map();
  for (const [index, group] of list(report.groups).entries()) {
    if (!isObject(group) || !filled(group.id)) {
      errors.push(`groups[${index}] needs an id`);
      continue;
    }
    if (ids.has(group.id)) errors.push(`group ${group.id} appears more than once`);
    ids.add(group.id);
    for (const file of list(group.files)) placed.set(file, (placed.get(file) ?? 0) + 1);
  }
  const gaps = list(report.gaps).filter((gap, index) => {
    const valid = isObject(gap) && relativePath(gap.path) && filled(gap.reason);
    if (!valid) errors.push(`gaps[${index}] needs a repository-relative path and a reason`);
    return valid;
  });
  for (const file of facts.inventory) {
    if (gaps.some((gap) => underPath(file, gap.path))) continue;
    const count = placed.get(file) ?? 0;
    if (count === 0) errors.push(`${file} is in no group and under no gaps path`);
    if (count > 1) errors.push(`${file} is in ${count} groups; place it in exactly one`);
  }
  return ids;
}

function validateLanes(report, registry, groupIds, errors) {
  const seen = new Set();
  for (const [index, entry] of list(report.lanes).entries()) {
    if (!isObject(entry) || !filled(entry.lane)) {
      errors.push(`lanes[${index}] needs a lane name`);
      continue;
    }
    const name = entry.lane;
    if (!registry.has(name))
      errors.push(`report.lanes names ${name}, which is not in the registry`);
    if (seen.has(name)) errors.push(`lane ${name} appears more than once in report.lanes`);
    seen.add(name);
    const ran = list(entry.ran);
    const failed = list(entry.failed).filter((item, at) => {
      const valid = isObject(item) && filled(item.group) && filled(item.reason);
      if (!valid) errors.push(`lane ${name}: failed[${at}] needs a group and a reason`);
      return valid;
    });
    const failedIds = failed.map((item) => item.group);
    for (const id of [...ran, ...failedIds]) {
      if (!groupIds.has(id)) errors.push(`lane ${name} names group ${id}, which is not in groups`);
    }
    for (const id of groupIds) {
      const inRan = ran.filter((item) => item === id).length;
      const inFailed = failedIds.filter((item) => item === id).length;
      if (inRan > 0 && inFailed > 0)
        errors.push(`lane ${name} lists group ${id} under both ran and failed`);
      else if (inRan + inFailed === 0)
        errors.push(`lane ${name} lists group ${id} under neither ran nor failed`);
      else if (inRan + inFailed > 1) errors.push(`lane ${name} lists group ${id} more than once`);
    }
  }
  for (const name of registry.keys()) {
    if (!seen.has(name))
      errors.push(`lane ${name} is in the registry but missing from report.lanes`);
  }
}

function validateFinding(finding, label, registry, scope, facts, errors) {
  const lane = registry.get(finding.lane);
  if (!lane) errors.push(`${label}: lane ${finding.lane} is not in the registry`);
  const id = String(finding.id ?? "").match(FINDING_ID);
  if (!id || id[1] !== finding.lane)
    errors.push(`${label}: id must be <lane>/<n>, with this finding's lane and a positive integer`);
  if (!filled(finding.title)) errors.push(`${label}: title is empty`);

  const citations = list(finding.citations);
  if (citations.length === 0) errors.push(`${label}: needs at least one citation`);
  for (const citation of citations) {
    const problem = citationProblem(citation, scope, facts);
    if (problem) errors.push(`${label}: citation ${citation} ${problem}`);
  }
  const evidence = list(finding.evidence).filter((item, index) => {
    const valid = isObject(item) && filled(item.kind) && filled(item.name);
    if (!valid) errors.push(`${label}: evidence[${index}] needs a kind, a name, and a citation`);
    return valid;
  });
  for (const item of evidence) {
    const problem = citationProblem(item.citation, scope, facts);
    if (problem)
      errors.push(`${label}: evidence ${item.kind} citation ${item.citation} ${problem}`);
  }
  for (const kind of lane?.evidence ?? []) {
    if (!evidence.some((item) => item.kind === kind))
      errors.push(`${label}: lane ${lane.lane} needs at least one evidence item of kind ${kind}`);
  }

  if (!OUTCOMES.includes(finding.outcome)) {
    errors.push(`${label}: outcome must be one of ${OUTCOMES.join(", ")}`);
    return;
  }
  if (finding.outcome === "reported" && lane?.makes)
    errors.push(`${label}: lane ${lane.lane} has a make step, so its findings are never reported`);
  if (finding.outcome !== "applied" && !filled(finding.reason))
    errors.push(`${label}: outcome ${finding.outcome} needs a reason`);
  if (finding.review !== undefined) validateReview(finding.review, label, errors);
  if (finding.outcome === "proposed" && !filled(finding.proposedChange))
    errors.push(`${label}: outcome proposed needs a proposedChange`);
  if (MADE.has(finding.outcome)) {
    validateArtifacts(finding, label, lane, facts, errors);
    validateChecks(finding, label, lane, facts, errors);
  }
  if (finding.outcome === "applied") validateApplied(finding, label, facts, errors);
}

// An applied refactor rests only on files the scripts wrote: the baseline, verify.json, and the
// finding's own tests.json.
function validateApplied(finding, label, facts, errors) {
  if (facts.baseline?.status !== "pass")
    errors.push(
      `${label}: outcome applied needs <run>/baseline.json to read pass, and it ${facts.baseline ? `reads ${facts.baseline.status}` : "is absent"}`,
    );
  const tests = list(finding.coveringTests);
  if (tests.length === 0) errors.push(`${label}: outcome applied needs coveringTests`);
  for (const test of tests) {
    if (!parseCitation(test)) errors.push(`${label}: coveringTests entry ${test} is not path:line`);
  }
  if (list(finding.changed).length === 0)
    errors.push(`${label}: outcome applied needs changed, the paths verify.json lists`);
  if (!APPLIED_REVIEWS.has(finding.review?.status))
    errors.push(`${label}: outcome applied needs review.status confirmed or not-run`);
  const item = list(finding.checks).find((check) => isObject(check) && check.name === "tests");
  if (!item) {
    errors.push(`${label}: outcome applied needs a tests item in checks`);
    return;
  }
  const file = facts.checks[item.result];
  if (!file || file.problem) return;
  const expected = facts.testsPaths[finding.id];
  if (file.real !== expected)
    errors.push(`${label}: the tests result must be ${expected}, not ${item.result}`);
  else if (file.data.status !== "pass")
    errors.push(`${label}: the tests result reads ${file.data.status}, not pass`);
  else if (file.data.tree !== facts.verifyTrees[finding.id])
    errors.push(
      `${label}: the tests result tree does not match checkpoints/${finding.id}/verify.json, so the tests ran on another tree`,
    );
}

function validateReview(review, label, errors) {
  if (!isObject(review) || !REVIEW_STATUSES.includes(review.status)) {
    errors.push(`${label}: review.status must be one of ${REVIEW_STATUSES.join(", ")}`);
    return;
  }
  if (review.status !== "confirmed" && !filled(review.reason))
    errors.push(`${label}: review ${review.status} needs a reason`);
}

function validateArtifacts(finding, label, lane, facts, errors) {
  const artifacts = list(finding.artifacts);
  for (const path of artifacts) {
    if (!relativePath(path)) errors.push(`${label}: artifact ${path} is not repository-relative`);
    else if (!facts.artifacts[path])
      errors.push(`${label}: artifact ${path} does not exist on disk`);
  }
  const suffixes = lane?.artifacts ?? [];
  if (suffixes.length > 0 && !artifacts.some((path) => suffixes.some((s) => path.endsWith(s))))
    errors.push(`${label}: needs an artifact ending in ${suffixes.join(" or ")}`);
}

function validateChecks(finding, label, lane, facts, errors) {
  const checks = list(finding.checks).filter((item, index) => {
    const valid = isObject(item) && filled(item.name) && filled(item.result);
    if (!valid) errors.push(`${label}: checks[${index}] needs a name and a result path`);
    return valid;
  });
  for (const item of checks) {
    const problem = facts.checks[item.result]?.problem ?? null;
    if (problem) errors.push(`${label}: check ${item.name} result ${item.result} ${problem}`);
  }
  for (const name of lane?.checks ?? []) {
    if (!checks.some((item) => item.name === name))
      errors.push(`${label}: lane ${lane.lane} needs a result for check ${name}`);
  }
}

// Returns every rule `report` breaks. `lanes` is the registry from list-lanes.mjs, and `facts`
// holds what the loader read: { head, inventory, lines, artifacts, checks, baseline, testsPaths,
// verifyTrees }. `lines` maps each cited
// path to its line count at scope.commit, or null when the path is absent there. `artifacts` maps
// each artifact path to whether it exists. `checks` maps each result path to { problem, data,
// changedInputs }, where `problem` is null for a readable result file under <run>. `baseline` is
// <run>/baseline.json or null. For each applied finding, `testsPaths` holds the one path its tests
// result may sit at, and `verifyTrees` holds the tree its verify.json recorded.
export function validateReport(report, lanes, facts) {
  if (!isObject(report)) return ["report is not a JSON object"];
  const errors = [];
  if (report.version !== 1) errors.push("version must be 1");
  if (report.skill !== SKILL) errors.push(`skill must be ${SKILL}`);
  const scope = isObject(report.scope) ? report.scope : {};
  validateScope(scope, facts, errors);
  const registry = new Map(lanes.map((lane) => [lane.lane, lane]));
  const groupIds = validateGroups(report, facts, errors);
  validateLanes(report, registry, groupIds, errors);

  const ids = new Set();
  for (const [index, finding] of list(report.findings).entries()) {
    if (!isObject(finding)) {
      errors.push(`findings[${index}] is not an object`);
      continue;
    }
    const label = filled(finding.id) ? finding.id : `findings[${index}]`;
    if (ids.has(finding.id)) errors.push(`${label}: id appears more than once`);
    ids.add(finding.id);
    validateFinding(finding, label, registry, scope, facts, errors);
  }
  return errors;
}

// The check as its result file states it. A pass whose inputs changed since the run reads not-run.
export function resolveCheck(item, file) {
  const data = file.data;
  const resolved = { name: item.name, result: item.result, status: data.status };
  for (const field of ["reason", "trace", "distinctStates", "seconds", "command"]) {
    if (data[field] !== undefined) resolved[field] = data[field];
  }
  if (data.status === "pass" && file.changedInputs.length > 0) {
    resolved.status = "not-run";
    resolved.reason = `spec changed after the run: ${file.changedInputs.join(", ")}`;
  }
  return resolved;
}

// Every finding with checks reads unverified, as no review has run.
export function findingLabel(finding) {
  return list(finding.checks).length === 0 ? "" : "unverified";
}

// Returns the report with each check replaced by what its result file states, and each label set.
export function resolveReport(report, facts) {
  return {
    ...report,
    findings: list(report.findings).map((finding) => {
      if (list(finding.checks).length === 0) return finding;
      const checks = finding.checks.map((item) => resolveCheck(item, facts.checks[item.result]));
      const resolved = { ...finding, checks };
      return { ...resolved, label: findingLabel(resolved) };
    }),
  };
}

function fence(text) {
  const longest = Math.max(0, ...[...String(text).matchAll(/`+/g)].map((run) => run[0].length));
  const ticks = "`".repeat(Math.max(MIN_FENCE, longest + 1));
  return `${ticks}text\n${text}\n${ticks}\n`;
}

const cell = (value) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");

function table(headers, rows) {
  if (rows.length === 0) return "None.\n";
  const lines = [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  return `${lines.join("\n")}\n`;
}

export function laneStatus(entry) {
  return list(entry.failed).length > 0 ? "partial" : "complete";
}

const codeList = (items) =>
  list(items)
    .map((item) => `\`${item}\``)
    .join(", ");

function checkDetail(check) {
  if (check.status === "pass" && check.distinctStates !== undefined)
    return `${check.distinctStates} distinct states`;
  if (check.status === "fail") return "counterexample trace below";
  return check.reason ?? "";
}

function findingSection(finding) {
  const out = [`### ${cell(finding.id)}: ${cell(finding.title)}\n`];
  out.push(`- Outcome: ${finding.outcome}`);
  if (filled(finding.label)) out.push(`- Label: ${finding.label}`);
  if (filled(finding.reason)) out.push(`- Reason: ${cell(finding.reason)}`);
  if (isObject(finding.review)) {
    const why = filled(finding.review.reason) ? `: ${cell(finding.review.reason)}` : "";
    out.push(`- Review: ${finding.review.status}${why}`);
  }
  out.push(`- Citations: ${codeList(finding.citations)}`);
  if (list(finding.artifacts).length > 0) out.push(`- Artifacts: ${codeList(finding.artifacts)}`);
  out.push("");
  out.push(
    table(
      ["Kind", "Name", "Citation"],
      list(finding.evidence).map((item) => [item.kind, item.name, item.citation]),
    ),
  );
  if (filled(finding.proposedChange))
    out.push(`Proposed change: ${cell(finding.proposedChange)}\n`);
  const checks = list(finding.checks);
  if (checks.length > 0) {
    out.push(
      table(
        ["Check", "Status", "Detail"],
        checks.map((check) => [check.name, check.status, checkDetail(check)]),
      ),
    );
    for (const check of checks.filter((item) => item.status === "fail"))
      out.push(`Trace for ${check.name}:\n\n${fence(check.trace)}`);
  }
  return out.join("\n");
}

// Renders report.md from a report that validateReport accepted.
export function renderReport(report, lanes) {
  const scope = report.scope;
  const summaries = new Map(lanes.map((lane) => [lane.lane, lane.summary]));
  const findings = list(report.findings);
  const out = [];
  out.push(`# Codebase improvement report\n`);
  out.push(
    `Repository \`${scope.root}\` at commit \`${scope.commit}\` on ${scope.date}. ` +
      `Scope: ${list(scope.paths)
        .map((path) => `\`${path}\``)
        .join(", ")}. Every citation names a line at that commit.\n`,
  );
  if (list(scope.dirty).length > 0)
    out.push(`Tracked changes at the start of the run: ${scope.dirty.join(", ")}.\n`);

  out.push("## Lanes\n");
  out.push(
    table(
      ["Lane", "Summary", "Status", "Groups ran", "Groups failed", ...OUTCOMES],
      list(report.lanes).map((entry) => [
        entry.lane,
        summaries.get(entry.lane),
        laneStatus(entry),
        list(entry.ran).length,
        list(entry.failed).length,
        ...OUTCOMES.map(
          (outcome) =>
            findings.filter((f) => f.lane === entry.lane && f.outcome === outcome).length,
        ),
      ]),
    ),
  );

  out.push("## Findings\n");
  out.push(
    table(
      ["ID", "Lane", "Outcome", "Label", "Title"],
      findings.map((f) => [f.id, f.lane, f.outcome, f.label ?? "", f.title]),
    ),
  );
  for (const finding of findings) out.push(findingSection(finding));

  out.push("## Failed groups\n");
  out.push(
    table(
      ["Lane", "Group", "Reason"],
      list(report.lanes).flatMap((entry) =>
        list(entry.failed).map((item) => [entry.lane, item.group, item.reason]),
      ),
    ),
  );
  out.push("## Gaps\n");
  out.push(
    table(
      ["Path", "Reason"],
      list(report.gaps).map((gap) => [gap.path, gap.reason]),
    ),
  );
  return out.join("\n");
}

function git(root, args, encoding = "utf8") {
  return spawnSync("git", ["-C", root, ...args], {
    encoding,
    env: childEnv(),
    maxBuffer: GIT_MAX_BUFFER,
  });
}

function lineCount(blob) {
  if (blob.length === 0) return 0;
  let count = 0;
  for (const byte of blob) if (byte === NEWLINE) count += 1;
  return blob[blob.length - 1] === NEWLINE ? count : count + 1;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Reads one check result file by real path, and rehashes each of its inputs.
function readCheckFile(path, runDir) {
  if (!isAbsolute(path)) return { problem: "is not an absolute path under <run>" };
  let real;
  try {
    real = realpathSync(path);
  } catch {
    return { problem: "does not exist" };
  }
  if (!real.startsWith(`${runDir}${sep}`)) return { problem: `is not under <run> ${runDir}` };
  let data;
  try {
    data = JSON.parse(readFileSync(real, "utf8"));
  } catch (error) {
    return { problem: `cannot be read: ${error.message}` };
  }
  if (!isObject(data) || !CHECK_STATUSES.includes(data.status))
    return { problem: `holds no status of ${CHECK_STATUSES.join(", ")}` };
  if (data.status === "fail" && !filled(data.trace)) return { problem: "reads fail with no trace" };
  if (data.status === "not-run" && !filled(data.reason))
    return { problem: "reads not-run with no reason" };
  const changedInputs = list(data.inputs)
    .filter((input) => {
      try {
        return sha256(readFileSync(input.path)) !== input.sha256;
      } catch {
        return true;
      }
    })
    .map((input) => input.path);
  return { problem: null, real, data, changedInputs };
}

// Reads what validateReport needs from git and disk: HEAD, the tracked inventory under scope.paths,
// the line count at scope.commit of each cited path, each artifact's presence, and each check
// result file under `runDir`. Returns { facts } or { errors }.
export function loadFacts(report, runDir) {
  const scope = isObject(report?.scope) ? report.scope : {};
  if (!filled(scope.root) || !isAbsolute(scope.root))
    return { errors: ["scope.root must be the absolute path of the repository's top level"] };
  const failure = (what, run) => ({
    errors: [`${what} failed in ${scope.root}: ${run.error?.message ?? run.stderr.trim()}`],
  });
  const top = git(scope.root, ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) return failure("git rev-parse --show-toplevel", top);
  let root;
  try {
    root = realpathSync(scope.root);
  } catch (error) {
    return { errors: [`cannot resolve scope.root ${scope.root}: ${error.message}`] };
  }
  if (top.stdout.trim() !== root)
    return { errors: [`scope.root ${scope.root} is not the top level ${top.stdout.trim()}`] };
  const head = git(root, ["rev-parse", "HEAD"]);
  if (head.status !== 0) return failure("git rev-parse HEAD", head);
  const files = git(root, ["ls-files", "-z"]);
  if (files.status !== 0) return failure("git ls-files", files);
  const inventory = files.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => list(scope.paths).some((scopePath) => underPath(path, scopePath)));
  const lines = {};
  for (const path of citedPaths(report)) {
    const blob = git(root, ["cat-file", "blob", `${scope.commit}:${path}`], "buffer");
    lines[path] = blob.status === 0 ? lineCount(blob.stdout) : null;
  }
  const artifacts = {};
  const checks = {};
  for (const finding of list(report.findings)) {
    if (!isObject(finding)) continue;
    for (const path of list(finding.artifacts)) {
      if (relativePath(path)) artifacts[path] = existsSync(join(root, path));
    }
    for (const item of list(finding.checks)) {
      if (isObject(item) && filled(item.result) && !(item.result in checks))
        checks[item.result] = readCheckFile(item.result, runDir);
    }
  }
  const readOptional = (path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  };
  const testsPaths = {};
  const verifyTrees = {};
  for (const finding of list(report.findings)) {
    if (!isObject(finding) || finding.outcome !== "applied" || !FINDING_ID.test(finding.id))
      continue;
    const dir = join(runDir, "checkpoints", finding.id);
    testsPaths[finding.id] = join(dir, "tests.json");
    verifyTrees[finding.id] = readOptional(join(dir, "verify.json"))?.tree ?? null;
  }
  const baseline = readOptional(join(runDir, "baseline.json"));
  return {
    facts: {
      head: head.stdout.trim(),
      inventory,
      lines,
      artifacts,
      checks,
      baseline,
      testsPaths,
      verifyTrees,
    },
  };
}

// Returns why the renderer refuses to write `target`, or null when it may write there.
function writeRefusal(target) {
  try {
    if (lstatSync(target).isSymbolicLink())
      return `${target} is a symlink, and the renderer never writes through one`;
  } catch (error) {
    if (error.code !== "ENOENT") return `cannot check ${target}: ${error.message}`;
  }
  return null;
}

// Returns why <out> must not receive this report, or null. A rerun may overwrite its own report.
function outRefusal(out) {
  for (const name of ["report.json", "report.md"]) {
    const refusal = writeRefusal(join(out, name));
    if (refusal) return refusal;
  }
  const existing = join(out, "report.json");
  let text;
  try {
    text = readFileSync(existing, "utf8");
  } catch (error) {
    return error.code === "ENOENT" ? null : `cannot read ${existing}: ${error.message}`;
  }
  try {
    if (JSON.parse(text)?.skill === SKILL) return null;
  } catch {
    // Unparsable JSON is someone else's file.
  }
  return `${existing} is not an ${SKILL} report, and the renderer never overwrites one`;
}

function fail(lines) {
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.stderr.write(`see ${DOC_PATH}\n`);
  return 1;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write("render-report.mjs: usage: render-report.mjs <report.json> <out>\n");
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  const [input, out] = args;
  let report;
  let runDir;
  try {
    runDir = dirname(realpathSync(input));
    report = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    return fail([`render-report.mjs: cannot read ${input}: ${error.message}`]);
  }
  const registry = listLanes();
  if (registry.errors.length > 0)
    return fail(["render-report.mjs: the lane registry is malformed", ...registry.errors]);
  const loaded = loadFacts(report, runDir);
  if (loaded.errors) return fail(loaded.errors.map((error) => `render-report.mjs: ${error}`));
  const errors = validateReport(report, registry.lanes, loaded.facts);
  if (errors.length > 0)
    return fail([
      `render-report.mjs: ${errors.length} error(s); nothing written`,
      ...errors.map((error) => `- ${error}`),
    ]);
  if (list(report.findings).length === 0) {
    process.stdout.write("no findings\n");
    return 0;
  }
  const refusal = outRefusal(out);
  if (refusal) return fail([`render-report.mjs: ${refusal}`]);
  const resolved = resolveReport(report, loaded.facts);
  const target = join(out, "report.md");
  try {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "report.json"), `${JSON.stringify(resolved, null, 2)}\n`);
    writeFileSync(target, renderReport(resolved, registry.lanes));
  } catch (error) {
    return fail([`render-report.mjs: cannot write ${out}: ${error.message}`]);
  }
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
