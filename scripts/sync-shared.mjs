#!/usr/bin/env node
// Copies each canonical shared/<f>.md into every tracked skill that links it, plus the files
// those canonical files link, so a skill installed alone resolves its shared rules.
//   node scripts/sync-shared.mjs          write the copies, delete stale ones
//   node scripts/sync-shared.mjs --check  write nothing; exit 1 listing missing, stale, or extra copies
// Any other argument exits 1 with a usage line, writing nothing.
// Acts on the git repository at the working directory. Skills and their files come from
// `git ls-files`, so staged files count and untracked skill directories are ignored.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SKILL_LINK = /^shared\/([a-z0-9-]+\.md)$/;
const SIBLING_LINK = /^([a-z0-9-]+\.md)(?:#.*)?$/;

function lsFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspecs], { encoding: "utf8" }).split("\0").filter(Boolean);
}

// Yields { line, target } for every link target and code-span path outside fenced code.
function* references(text, { spans }) {
  let fence = null;
  let openTicks = null;
  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    let marker = raw.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker?.[1][0] === "`" && marker[2].includes("`")) marker = null;
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      openTicks = null;
      continue;
    }
    if (!raw.trim()) {
      openTicks = null;
      continue;
    }
    let prose = "";
    let cursor = 0;
    for (const run of raw.matchAll(/`+/g)) {
      if (openTicks === null) {
        prose += raw.slice(cursor, run.index);
        openTicks = run[0].length;
      } else if (run[0].length === openTicks) {
        if (spans) yield { line: index + 1, target: raw.slice(cursor, run.index).trim().split(/\s/)[0] };
        openTicks = null;
      } else continue;
      cursor = run.index + run[0].length;
    }
    if (openTicks === null) prose += raw.slice(cursor);
    for (const [, target] of prose.matchAll(/\]\(([^)\s]+)/g)) yield { line: index + 1, target };
  }
}

// Returns the canonical names one skill needs: its direct shared/ links plus their closure.
function derive(name, files, errors) {
  const needed = new Map();
  const need = (file, from) => {
    if (needed.has(file)) return;
    if (!existsSync(join("shared", file))) {
      errors.push(`${from} -> shared/${file}: no canonical file shared/${file}`);
      return;
    }
    needed.set(file, from);
    const text = readFileSync(join("shared", file), "utf8");
    for (const { line, target } of references(text, { spans: false })) {
      const match = target.match(SIBLING_LINK);
      if (match) need(match[1], `shared/${file}:${line}`);
    }
  };
  for (const path of files) {
    if (!path.endsWith(".md") || path.startsWith(`skills/${name}/shared/`)) continue;
    for (const { line, target } of references(readFileSync(path, "utf8"), { spans: true })) {
      const match = target.split("#")[0].match(SKILL_LINK);
      if (match) need(match[1], `${path}:${line}`);
    }
  }
  return [...needed.keys()].sort();
}

function plan() {
  const errors = [];
  const skills = lsFiles("skills/*/SKILL.md")
    .filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => path.split("/")[1])
    .sort();
  const copies = skills.map((name) => ({ dir: `skills/${name}/shared`, files: derive(name, lsFiles(`skills/${name}`), errors) }));
  return { errors, copies };
}

function onDisk(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function check(copies) {
  const problems = [];
  for (const { dir, files } of copies) {
    for (const file of files) {
      const copy = join(dir, file);
      if (!existsSync(copy)) problems.push(`missing: ${copy}`);
      else if (!readFileSync(copy).equals(readFileSync(join("shared", file)))) problems.push(`stale: ${copy}`);
    }
    for (const file of onDisk(dir)) if (!files.includes(file)) problems.push(`extra: ${join(dir, file)}`);
  }
  return problems;
}

function write(copies) {
  for (const { dir, files } of copies) {
    if (files.length) mkdirSync(dir, { recursive: true });
    for (const file of files) copyFileSync(join("shared", file), join(dir, file));
    for (const file of onDisk(dir)) if (!files.includes(file)) rmSync(join(dir, file), { recursive: true, force: true });
    if (existsSync(dir) && onDisk(dir).length === 0) rmdirSync(dir);
  }
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  console.error("usage: node scripts/sync-shared.mjs [--check]");
  process.exit(1);
}
const { errors, copies } = plan();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (args[0] === "--check") {
  const problems = check(copies);
  if (problems.length) {
    console.error(`${problems.join("\n")}\nRun npm run sync-shared.`);
    process.exit(1);
  }
} else {
  write(copies);
}
