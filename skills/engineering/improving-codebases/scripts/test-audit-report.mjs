#!/usr/bin/env node
// Validates an improving-codebases test-audit lane report.json and renders report.md beside it.
// Usage: test-audit-report.mjs <report.json> [<report.md>]
//   exit 0  wrote report.md (beside report.json unless named) and printed its path
//   exit 1  wrote nothing; stderr names an unreadable report.json, lists every validation error, or
//           names a report.md that is a symlink or cannot be written
//   exit 2  no report.json argument; stderr prints the usage line
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The lane brief that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/lanes/test-audit.md", import.meta.url));

export const MARKS = ["R", "F", "C", "D"];
export const JUNK_CLASSES = [
  "cannot-fail",
  "restates-source",
  "duplicates-stronger-proof",
  "keeps-test-only-code",
  "promises-more-than-checked",
];
export const EVIDENCE_FIELDS = [
  "location",
  "origin",
  "caughtBug",
  "callers",
  "remainingProof",
  "freedCode",
  "riskAndCommand",
];

const REQUIRED_BY_MARK = {
  R: ["contract", "catches"],
  F: ["contract", "junkClass", "action"],
  C: ["junkClass", "absorbedBy"],
  D: ["junkClass"],
};

const filled = (value) => typeof value === "string" && value.trim() !== "";
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateReport(report) {
  const errors = [];
  if (!isObject(report)) return ["report is not a JSON object"];
  if (report.version !== 1) errors.push("version must be 1");
  if (report.skill !== "improving-codebases") errors.push("skill must be improving-codebases");
  if (report.lane !== "test-audit") errors.push("lane must be test-audit");

  const scope = report.scope ?? {};
  for (const field of ["commit", "discovery", "date"]) {
    if (!filled(scope[field])) errors.push(`scope.${field} is required`);
  }

  const baseline = report.baseline ?? {};
  if (baseline.status === "ran") {
    if (!filled(baseline.command))
      errors.push("baseline.command is required when baseline.status is ran");
  } else if (baseline.status === "not-run") {
    if (!filled(baseline.reason))
      errors.push("baseline.reason is required when baseline.status is not-run");
  } else {
    errors.push("baseline.status must be ran or not-run");
  }
  const redTests = new Set(list(baseline.failures).map((f) => `${f.file}::${f.name}`));

  const inventory = list(report.inventory);
  const placements = new Map(inventory.map((file) => [file, 0]));
  const place = (file, where) => {
    if (!placements.has(file)) errors.push(`${where} lists ${file}, which is not in inventory`);
    else placements.set(file, placements.get(file) + 1);
  };

  const groups = list(report.groups).filter((group, index) => {
    if (!isObject(group)) errors.push(`groups[${index}] is not an object`);
    return isObject(group);
  });
  const tests = new Map();
  for (const group of groups) {
    const groupName = filled(group.name) ? group.name : "(unnamed group)";
    if (!filled(group.name)) errors.push("every group needs a name");
    if ("seams" in group)
      errors.push(`group ${groupName} has a seams field; rename it to testOnlyCode`);
    const groupFiles = new Set(list(group.files));
    for (const file of groupFiles) place(file, `group ${groupName}`);

    for (const [index, test] of list(group.tests).entries()) {
      if (!isObject(test)) {
        errors.push(`group ${groupName} tests[${index}] is not an object`);
        continue;
      }
      const id = test.id;
      if (!filled(id)) {
        errors.push(`group ${groupName} has a test with no id`);
        continue;
      }
      if (tests.has(id)) errors.push(`test id ${id} appears more than once`);
      tests.set(id, test);
      if (!groupFiles.has(test.file))
        errors.push(`${id}: file ${test.file} is not in group ${groupName}`);
      if (!MARKS.includes(test.mark)) {
        errors.push(`${id}: mark must be one of ${MARKS.join(", ")}`);
        continue;
      }
      for (const field of REQUIRED_BY_MARK[test.mark]) {
        if (!filled(test[field])) errors.push(`${id}: mark ${test.mark} requires ${field}`);
      }
      if (test.mark !== "R" && filled(test.junkClass) && !JUNK_CLASSES.includes(test.junkClass)) {
        errors.push(`${id}: junkClass ${test.junkClass} is not one of ${JUNK_CLASSES.join(", ")}`);
      }
      if (test.mark === "D") {
        for (const field of EVIDENCE_FIELDS) {
          if (!filled(test.evidence?.[field])) {
            errors.push(`${id}: mark D requires evidence.${field}; complete it or mark the test R`);
          }
        }
        if (redTests.has(`${test.file}::${test.name}`)) {
          errors.push(
            `${id}: fails on the baseline, so it is a product-bug lead and cannot be marked D`,
          );
        }
      }
      if ((test.mark === "C" || test.mark === "D") && test.verified !== true) {
        errors.push(`${id}: mark ${test.mark} requires verified: true`);
      }
    }
  }

  for (const gap of list(report.gaps)) place(gap.file, "gaps");
  for (const [file, count] of placements) {
    if (count === 0) errors.push(`${file} is in no group and no gap`);
    if (count > 1) errors.push(`${file} is placed ${count} times; place it exactly once`);
  }

  for (const group of groups) {
    for (const code of list(group.testOnlyCode)) {
      for (const id of list(code.freedBy)) {
        if (!tests.has(id)) errors.push(`testOnlyCode ${code.location} names unknown test ${id}`);
      }
    }
  }
  for (const entry of list(report.downgraded)) {
    const test = tests.get(entry.id);
    if (!test) errors.push(`downgraded names unknown test ${entry.id}`);
    else if (test.mark !== "R")
      errors.push(`${entry.id} is listed as downgraded but is marked ${test.mark}`);
  }
  return errors;
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

function allTests(report) {
  return list(report.groups).flatMap((group) =>
    list(group.tests).map((test) => ({ group: group.name, ...test })),
  );
}

export function renderReport(report) {
  const tests = allTests(report);
  const count = (mark) => tests.filter((t) => t.mark === mark).length;
  const byMark = (mark) => tests.filter((t) => t.mark === mark);
  const baseline = report.baseline;
  const scope = report.scope;
  const out = [];

  out.push(`# Test audit: ${scope.root ?? "repository"}\n`);
  out.push(
    `Commit \`${scope.commit}\` on ${scope.date}. Scope: ${list(scope.paths).join(", ") || "whole repository"}. ` +
      `Inventory: \`${scope.discovery}\`.\n`,
  );
  if (list(scope.dirty).length > 0)
    out.push(`Audited with uncommitted changes in: ${scope.dirty.join(", ")}.\n`);

  out.push("## Summary\n");
  out.push(
    table(
      ["Measure", "Count"],
      [
        ["Test files", list(report.inventory).length],
        ["Tests audited", tests.length],
        ["R: retain", count("R")],
        ["F: fix the assertion", count("F")],
        ["C: consolidate", count("C")],
        ["D: delete", count("D")],
        ["Baseline failures", list(baseline.failures).length],
        ["Downgraded to R", list(report.downgraded).length],
        ["Files not audited", list(report.gaps).length],
      ],
    ),
  );

  out.push("## Baseline\n");
  out.push(
    baseline.status === "ran"
      ? `Ran \`${baseline.command}\`: ${list(baseline.failures).length} failing test(s).\n`
      : `Not run: ${baseline.reason}. Every mark rests on reading alone.\n`,
  );

  out.push("## Product-bug leads\n");
  out.push(
    "A test that fails on the baseline points at the product first. Reproduce it and repair the owner.\n",
  );
  out.push(
    table(
      ["File", "Test", "Failure"],
      list(baseline.failures).map((f) => [f.file, f.name, f.assertion]),
    ),
  );

  out.push("## Delete (D)\n");
  out.push(
    table(
      ["Group", "Test", "Class", ...EVIDENCE_FIELDS],
      byMark("D").map((t) => [
        t.group,
        `${t.file}:${t.line ?? "?"} ${t.name}`,
        t.junkClass,
        ...EVIDENCE_FIELDS.map((f) => t.evidence[f]),
      ]),
    ),
  );
  out.push("## Consolidate (C)\n");
  out.push(
    table(
      ["Group", "Test", "Class", "Absorbed by"],
      byMark("C").map((t) => [
        t.group,
        `${t.file}:${t.line ?? "?"} ${t.name}`,
        t.junkClass,
        t.absorbedBy,
      ]),
    ),
  );
  out.push("## Fix the assertion (F)\n");
  out.push(
    table(
      ["Group", "Test", "Class", "Contract", "Repair"],
      byMark("F").map((t) => [
        t.group,
        `${t.file}:${t.line ?? "?"} ${t.name}`,
        t.junkClass,
        t.contract,
        t.action,
      ]),
    ),
  );

  out.push("## Redundant layers\n");
  out.push(
    table(
      ["Contract", "Keeper", "Retire", "Carry into keeper"],
      list(report.layers).map((l) => [
        l.contract,
        l.keeper,
        list(l.retire).join(", "),
        list(l.carry).join("; "),
      ]),
    ),
  );

  out.push("## Test-only code\n");
  out.push(
    table(
      ["Location", "Kind", "Freed by"],
      list(report.groups).flatMap((group) =>
        list(group.testOnlyCode).map((c) => [c.location, c.kind, list(c.freedBy).join(", ")]),
      ),
    ),
  );

  out.push("## Downgraded candidates\n");
  out.push(
    table(
      ["Test", "Was", "Reason"],
      list(report.downgraded).map((d) => [d.id, d.from, d.reason]),
    ),
  );

  out.push("## Suggested batches\n");
  const batches = list(report.groups).filter((group) =>
    list(group.tests).some((t) => t.mark === "C" || t.mark === "D"),
  );
  out.push(
    batches.length === 0
      ? "None.\n"
      : `${batches
          .map((group) => {
            const ids = list(group.tests).filter((t) => t.mark === "C" || t.mark === "D");
            return `- **${group.name}**: ${ids.length} candidate(s) in one owner-boundary change.`;
          })
          .join("\n")}\n`,
  );

  out.push("## Auditor notes\n");
  const notes = list(report.groups).flatMap((group) =>
    list(group.notes).map((note) => `- **${group.name}**: ${cell(note)}`),
  );
  out.push(notes.length === 0 ? "None.\n" : `${notes.join("\n")}\n`);

  out.push("## Ledger\n");
  for (const group of list(report.groups)) {
    out.push(`### ${group.name}\n`);
    out.push(`Owner: ${list(group.owner).join(", ") || "unstated"}.\n`);
    out.push(
      table(
        ["Mark", "Test", "Guards", "Catches"],
        list(group.tests).map((t) => [
          t.mark,
          `${t.file}:${t.line ?? "?"} ${t.name}`,
          t.contract ?? t.absorbedBy ?? "",
          t.catches ?? t.junkClass ?? "",
        ]),
      ),
    );
  }

  out.push("## Not audited\n");
  out.push(
    table(
      ["File", "Reason"],
      list(report.gaps).map((g) => [g.file, g.reason]),
    ),
  );

  return out.join("\n");
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

function main(args) {
  const [input, output] = args;
  if (!input) {
    process.stderr.write(
      "test-audit-report.mjs: usage: test-audit-report.mjs <report.json> [<report.md>]\n",
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    process.stderr.write(`test-audit-report.mjs: cannot read ${input}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  const errors = validateReport(report);
  if (errors.length > 0) {
    process.stderr.write(`test-audit-report.mjs: ${errors.length} error(s); nothing written\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  const target = output ?? join(dirname(input), "report.md");
  const refusal = writeRefusal(target);
  if (refusal) {
    process.stderr.write(`test-audit-report.mjs: ${refusal}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  try {
    writeFileSync(target, renderReport(report));
  } catch (error) {
    process.stderr.write(`test-audit-report.mjs: cannot write ${target}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
