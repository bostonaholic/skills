#!/usr/bin/env node
// Ranks the inventory files of an improving-codebases run by commit count and prints the hot files
// of one group, each with its commits and the files it changes with.
// Usage: churn.mjs <run>/report.json <group-id>
//   exit 0  printed the JSON result on stdout
//   exit 1  the report is unreadable or malformed, the group is unknown, or git failed; stderr says which
//   exit 2  wrong arguments; stderr prints the usage line
// Ranks only files that sit in some group, so gaps such as lock files and generated code never
// rank. Counts non-merge commits reachable from scope.commit in the WINDOW_DAYS before its commit
// date. Imports only node: modules.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

export const WINDOW_DAYS = 365;
// A file ranks as hot only within the top TOP_N and with at least MIN_COMMITS commits.
export const TOP_N = 10;
export const MIN_COMMITS = 3;
// A commit that touches more inventory files than this is a sweep (a rename, a reformat), and
// counting it would rank every file it touched.
export const MAX_FILES_PER_COMMIT = 50;
const MAX_COMMITS_SHOWN = 20;
const MAX_CO_CHANGED = 5;
const GROUP_ID = /^[A-Za-z0-9._-]+$/;
const COMMIT = /^[0-9a-f]{40,64}$/;
const RECORD = "\x1e";
const FIELD = "\x1f";

class Failure extends Error {}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, "-c", "core.quotePath=false", ...args], {
      encoding: "utf8",
      maxBuffer: 1 << 30,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Failure(`git ${args[0]} failed: ${detail}`);
  }
}

function readReport(path) {
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Failure(`cannot read ${path}: ${error.message}`);
  }
  const root = report?.scope?.root;
  const commit = report?.scope?.commit;
  if (typeof root !== "string" || root === "") throw new Failure(`${path}: no scope.root`);
  if (typeof commit !== "string" || !COMMIT.test(commit))
    throw new Failure(`${path}: scope.commit is not a full commit id`);
  if (!Array.isArray(report.groups)) throw new Failure(`${path}: no groups array`);
  return { root, commit, groups: report.groups };
}

// Parses `git log` output written with RECORD before each commit and FIELD between its fields.
export function parseLog(text) {
  return text
    .split(RECORD)
    .slice(1)
    .map((record) => {
      const [header, ...names] = record.split("\n");
      const [sha, date, subject] = header.split(FIELD);
      return { sha, date, subject, files: names.filter(Boolean) };
    });
}

const byCountThenPath = (a, b) => b.commits - a.commits || (a.path < b.path ? -1 : 1);

// Pure ranking over parsed commits. `inventory` is every grouped file; `groupFiles` is the group's.
export function rankChurn(commits, inventory, groupFiles) {
  const known = new Set(inventory);
  const counted = [];
  let sweeps = 0;
  for (const commit of commits) {
    const files = [...new Set(commit.files.filter((file) => known.has(file)))];
    if (files.length === 0) continue;
    if (files.length > MAX_FILES_PER_COMMIT) {
      sweeps += 1;
      continue;
    }
    counted.push({ ...commit, files });
  }
  const counts = new Map();
  for (const commit of counted)
    for (const file of commit.files) counts.set(file, (counts.get(file) ?? 0) + 1);
  const ranked = [...counts].map(([path, commits]) => ({ path, commits })).sort(byCountThenPath);
  const inGroup = new Set(groupFiles);
  const hot = ranked
    .slice(0, TOP_N)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
    .filter((entry) => entry.commits >= MIN_COMMITS && inGroup.has(entry.path))
    .map((entry) => {
      const touching = counted.filter((commit) => commit.files.includes(entry.path));
      const partners = new Map();
      for (const commit of touching)
        for (const file of commit.files)
          if (file !== entry.path) partners.set(file, (partners.get(file) ?? 0) + 1);
      return {
        ...entry,
        coChanged: [...partners]
          .map(([path, commits]) => ({ path, commits }))
          .filter((partner) => partner.commits >= 2)
          .sort(byCountThenPath)
          .slice(0, MAX_CO_CHANGED),
        recent: touching
          .slice(0, MAX_COMMITS_SHOWN)
          .map(({ sha, date, subject }) => ({ sha, date, subject })),
      };
    });
  return { ranked: ranked.length, sweepsSkipped: sweeps, hot };
}

export function churn(reportPath, groupId) {
  const { root, commit, groups } = readReport(reportPath);
  const group = groups.find((candidate) => candidate?.id === groupId);
  if (!group || !Array.isArray(group.files))
    throw new Failure(`${reportPath}: no group with id ${groupId}`);
  const inventory = groups.flatMap((candidate) =>
    Array.isArray(candidate?.files) ? candidate.files : [],
  );
  const end = git(root, ["show", "-s", "--format=%cI", commit]).trim();
  const since = new Date(Date.parse(end) - WINDOW_DAYS * 86_400_000).toISOString();
  const log = git(root, [
    "log",
    "--no-merges",
    "--find-renames",
    "--name-only",
    `--since=${since}`,
    `--format=${RECORD}%H${FIELD}%cs${FIELD}%s`,
    commit,
    "--",
  ]);
  return {
    commit,
    since: since.slice(0, 10),
    until: end.slice(0, 10),
    group: groupId,
    topN: TOP_N,
    minCommits: MIN_COMMITS,
    ...rankChurn(parseLog(log), inventory, group.files),
  };
}

function main(args) {
  if (args.length !== 2 || !GROUP_ID.test(args[1])) {
    process.stderr.write("churn.mjs: usage: churn.mjs <run>/report.json <group-id>\n");
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 2;
  }
  try {
    process.stdout.write(`${JSON.stringify(churn(args[0], args[1]), null, 2)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(`churn.mjs: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
