#!/usr/bin/env node
// Finds an untrusted clone's dependency manifests and lockfiles and runs the
// read-only CVE scanner for each lockfile. Never runs a package manager in the
// clone and never runs the clone's code.
//
// Usage: scan-deps.mjs <clone>
//
// Walks <clone>, skipping .git, node_modules, vendor, dist, and every symlink.
// Each lockfile is copied alone into a fresh temporary directory and scanned
// there, so the clone's .npmrc, advisory-ignore files, and .cargo config never
// reach a scanner. The scanner is osv-scanner when installed, else the
// lockfile's fallback below, else none:
//
//   package-lock.json   npm audit --package-lock-only --json (package.json copied too)
//   Gemfile.lock        bundle-audit check --update --format json
//   requirements.txt    pip-audit -r requirements.txt --no-deps --disable-pip -f json,
//                       only when every requirement is pinned with ==
//   Cargo.lock          cargo-audit audit --file Cargo.lock --json, by binary name:
//                       a .cargo/config.toml alias can redefine `cargo audit`
//   yarn.lock, pnpm-lock.yaml, poetry.lock, uv.lock, go.sum: osv-scanner only
//
// Prints one JSON object to stdout, every path relative to <clone>, every list
// sorted by path:
//
//   scanners        { "<tool>": "<path on PATH>" | null } for each scanner
//   manifests       manifest paths
//   lockfiles       [{ path, scanner, status, exitCode?, report?, reason? }]
//                   status: ran (report holds the scanner's JSON),
//                   not-installed (scanner names the missing tool),
//                   unpinned (a requirements.txt pip-audit cannot scan),
//                   error (reason holds the tail of the scanner's stderr)
//   missingLockfile manifests with no matching lockfile in their directory or
//                   an ancestor inside the clone, and unpinned requirements.txt
//   ignoreConfig    osv-scanner.toml and .bundler-audit.yml paths
//   npmrcRegistry   [{ path, line, value }] for each registry setting in a .npmrc
//
// Exit codes:
//   0  every lockfile with an installed scanner was scanned
//   1  at least one scanner failed; the JSON is still printed
//   2  usage error: no <clone>, extra arguments, or <clone> is not a directory
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Installed, vendored, and built code is not the repo's own dependency list.
const SKIPPED_DIRS = new Set([".git", "node_modules", "vendor", "dist"]);

// Each manifest and the lockfiles that pin it.
export const MANIFEST_LOCKFILES = {
  "package.json": ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
  Gemfile: ["Gemfile.lock"],
  "Cargo.toml": ["Cargo.lock"],
  "pyproject.toml": ["poetry.lock", "uv.lock"],
  "go.mod": ["go.sum"],
};

export const LOCKFILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "go.sum",
  "requirements.txt",
];

const IGNORE_CONFIGS = new Set(["osv-scanner.toml", ".bundler-audit.yml"]);

// Every scanner exits 1 when it finds advisories, which is a result, not a
// failure. osv-scanner exits 128 when a lockfile has no packages to scan.
const OK_EXITS = { "osv-scanner": [0, 1, 128] };
const DEFAULT_OK_EXITS = [0, 1];

// A scanner that hangs on a network call fails its lockfile, not the audit.
const TIMEOUT_MS = 300_000;
// npm audit's JSON for a large tree runs to tens of megabytes.
const MAX_BUFFER = 256 * 1024 * 1024;
// Enough of stderr to name the failure without flooding the report.
const STDERR_TAIL = 2000;

const SCANNERS = ["osv-scanner", "npm", "bundle-audit", "pip-audit", "cargo-audit"];

// The command for each lockfile, run in a temporary directory holding a copy.
// `copies` are sibling files the scanner also needs; `output` is a file the
// scanner writes its report to instead of stdout.
const FALLBACKS = {
  "package-lock.json": {
    tool: "npm",
    args: ["audit", "--package-lock-only", "--json"],
    copies: ["package.json"],
  },
  "Gemfile.lock": {
    tool: "bundle-audit",
    // --update prints progress to stdout, so the report goes to a file.
    args: ["check", "--update", "--format", "json", "--output", "bundle-audit.json"],
    output: "bundle-audit.json",
  },
  "requirements.txt": {
    tool: "pip-audit",
    args: ["-r", "requirements.txt", "--no-deps", "--disable-pip", "-f", "json"],
  },
  "Cargo.lock": { tool: "cargo-audit", args: ["audit", "--file", "Cargo.lock", "--json"] },
};

const osvCommand = (name) => ({
  tool: "osv-scanner",
  args: ["scan", "-L", name, "--format", "json"],
});

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// Every file under root, as clone-relative paths with / separators.
function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) visit(full);
      } else if (entry.isFile()) {
        files.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort();
}

// True when every requirement line pins one version with ==, as pip-audit
// --no-deps needs. Comments, blank lines, and --hash continuations are allowed;
// any option line (-r, -e, --index-url) is not.
export function isPinned(text) {
  const logical = text.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  return logical
    .map((line) => line.replace(/(^|\s)#.*$/, "").trim())
    .filter(Boolean)
    .every((line) => /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[^\]]*\])?===?[^=\s;]+/.test(line));
}

// Each registry setting (`registry=` or `@scope:registry=`) in an .npmrc.
export function npmrcRegistries(text) {
  const found = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (/^(@[^\s=:]+:)?registry\s*=/.test(line)) found.push({ line: index + 1, value: line });
  });
  return found;
}

function which(tool, path) {
  for (const dir of (path ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, tool);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not in this PATH entry.
    }
  }
  return null;
}

function runScanner(clone, lockPath, command, executable) {
  const work = mkdtempSync(join(tmpdir(), "scan-deps-"));
  try {
    const name = basename(lockPath);
    copyFileSync(join(clone, lockPath), join(work, name));
    for (const sibling of command.copies ?? []) {
      const from = join(clone, dirname(lockPath), sibling);
      if (existsSync(from)) copyFileSync(from, join(work, sibling));
    }
    const run = spawnSync(executable, command.args, {
      cwd: work,
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    const ok = OK_EXITS[command.tool] ?? DEFAULT_OK_EXITS;
    const fail = (reason) => ({ status: "error", exitCode: run.status, reason });
    if (run.error) return fail(`${command.tool}: ${run.error.message}`);
    if (!ok.includes(run.status)) {
      return fail((run.stderr || `${command.tool} exited ${run.status}`).slice(-STDERR_TAIL));
    }
    const raw = command.output
      ? existsSync(join(work, command.output))
        ? readFileSync(join(work, command.output), "utf8")
        : ""
      : run.stdout;
    if (run.status === 128 && raw.trim() === "") {
      return { status: "ran", exitCode: run.status, report: null };
    }
    try {
      return { status: "ran", exitCode: run.status, report: JSON.parse(raw) };
    } catch {
      return fail(`${command.tool} printed output that is not JSON`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function scanDeps(clone, path = process.env.PATH) {
  const files = walk(clone);
  const scanners = Object.fromEntries(SCANNERS.map((tool) => [tool, which(tool, path)]));
  const present = new Set(files);
  const named = (names) => files.filter((file) => names.includes(basename(file)));
  const pinned = new Map(
    named(["requirements.txt"]).map((file) => [
      file,
      isPinned(readFileSync(join(clone, file), "utf8")),
    ]),
  );

  const manifests = named(Object.keys(MANIFEST_LOCKFILES));
  const missingLockfile = manifests.filter((manifest) => {
    const locks = MANIFEST_LOCKFILES[basename(manifest)];
    for (let dir = dirname(manifest); ; dir = dirname(dir)) {
      const prefix = dir === "." ? "" : `${dir}/`;
      if (locks.some((lock) => present.has(prefix + lock))) return false;
      if (dir === ".") return true;
    }
  });
  for (const [file, isLocked] of pinned) if (!isLocked) missingLockfile.push(file);

  const lockfiles = named(LOCKFILES).map((path) => {
    const name = basename(path);
    const fallback = FALLBACKS[name];
    const command = scanners["osv-scanner"] ? osvCommand(name) : fallback;
    if (!command || !scanners[command.tool]) {
      return { path, scanner: command?.tool ?? "osv-scanner", status: "not-installed" };
    }
    if (command.tool === "pip-audit" && !pinned.get(path)) {
      return { path, scanner: "pip-audit", status: "unpinned" };
    }
    return {
      path,
      scanner: command.tool,
      ...runScanner(clone, path, command, scanners[command.tool]),
    };
  });

  const npmrcRegistry = named([".npmrc"]).flatMap((file) =>
    npmrcRegistries(readFileSync(join(clone, file), "utf8")).map((hit) => ({
      path: file,
      ...hit,
    })),
  );

  return {
    scanners,
    manifests: manifests.sort(),
    lockfiles: lockfiles.sort(byPath),
    missingLockfile: missingLockfile.sort(),
    ignoreConfig: files.filter((file) => IGNORE_CONFIGS.has(basename(file))),
    npmrcRegistry,
  };
}

function main(args) {
  if (args.length !== 1) {
    console.error("scan-deps.mjs: usage: scan-deps.mjs <clone>");
    return 2;
  }
  let clone;
  try {
    clone = realpathSync(args[0]);
    if (!statSync(clone).isDirectory()) throw new Error();
  } catch {
    console.error(`scan-deps.mjs: not a directory: ${args[0]}`);
    return 2;
  }
  const result = scanDeps(clone);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const failed = result.lockfiles.filter((lock) => lock.status === "error");
  for (const lock of failed) console.error(`scan-deps.mjs: ${lock.scanner} failed on ${lock.path}`);
  return failed.length ? 1 : 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
