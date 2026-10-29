#!/usr/bin/env node

/**
 * Runs the deterministic gates of a gh stack run. Run it from inside the
 * repository, with stdout sent to a file, never piped:
 *
 *     node "<skill-dir>/scripts/stack-guard.mjs" repo > <out-file>
 *
 * Requires `git` and `gh` (authenticated) on PATH. Every gh call runs with
 * GH_FORCE_TTY and GH_STACK_NO_ATOMIC removed from its environment, and with
 * GH_REPO kept, so the script sees the repository `gh stack` sees.
 *
 * repo
 *   Reads `git remote`, each remote's `url` and `pushurl` (before insteadOf
 *   rewriting), `remote.pushDefault`, `remote.*.gh-resolved`, GH_REPO, and
 *   `gh repo view --json nameWithOwner,url,defaultBranchRef`. Picks the one
 *   remote that hosts the PRs, then stops unless every source names that
 *   remote's repository. On exit 0 prints these KEY=VALUE lines:
 *
 *     REMOTE   the remote to pass as --remote
 *     REPO     <host>/<owner>/<repo>, to pass as --repo (host from gh's url)
 *     DEFAULT  the repository's default branch
 *
 * Exit codes, each failure with its reason on stderr, then any wrapped
 * command's stderr, then a last line `see <recovery.md>`:
 *
 *   0  pass
 *   1  a git or gh command failed, gh printed no JSON, or a name failed the
 *      allowlist ^[A-Za-z0-9._/-]+$ (no leading -)
 *   2  wrong arguments
 *   7  several remotes and no remote.pushDefault, or a pushDefault that names
 *      no configured remote
 *   8  no remote, a remote URL or pushurl that names no GitHub repository, or
 *      another source that names a different repository
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = "stack-guard.mjs";
const DOC_PATH = fileURLToPath(new URL("../references/recovery.md", import.meta.url));
const USAGE = [`usage: node ${SCRIPT} repo > <out-file>`];

const EXIT_PASS = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_ASK_REMOTE = 7;
const EXIT_WRONG_REPOSITORY = 8;

// `git config` exits 1 when the key or pattern matches nothing.
const GIT_CONFIG_NOT_SET = 1;
// Large enough for a GraphQL answer of 100 pull requests per branch.
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

const NAME_PATTERN = /^[A-Za-z0-9._/-]+$/;
const HTTP_URL_PATTERN =
  /^(https?):\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const SSH_URL_PATTERN =
  /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const SCP_URL_PATTERN = /^(?:[^@/:]+@)?([^/:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

class Stop extends Error {
  constructor(exitCode, reasons, wrappedStderr = "") {
    super(reasons.join("\n"));
    this.exitCode = exitCode;
    this.reasons = reasons;
    this.wrappedStderr = wrappedStderr;
  }
}

function stop(exitCode, reasons, wrappedStderr = "") {
  throw new Stop(exitCode, reasons, wrappedStderr);
}

// Pure parsing and comparison over values already read.

function isAllowedName(name) {
  return typeof name === "string" && NAME_PATTERN.test(name) && !name.startsWith("-");
}

function requireAllowedName(name, what) {
  if (!isAllowedName(name))
    stop(EXIT_FAILED, [`${what} \`${name}\` is outside the allowed characters [A-Za-z0-9._/-].`]);
  return name;
}

function parseRepositoryUrl(url) {
  const http = HTTP_URL_PATTERN.exec(url);
  if (http) return { web: true, host: http[2], owner: http[3], name: http[4] };
  const ssh = SSH_URL_PATTERN.exec(url);
  if (ssh) return { web: false, host: ssh[1], owner: ssh[2], name: ssh[3] };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return null;
  const scp = SCP_URL_PATTERN.exec(url);
  if (scp) return { web: false, host: scp[1], owner: scp[2], name: scp[3] };
  return null;
}

function fullName(repository) {
  return `${repository.owner}/${repository.name}`;
}

function sameRepository(left, right) {
  return fullName(left).toLowerCase() === fullName(right).toLowerCase();
}

function sameHost(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function pickRemote({ names, pushDefault }) {
  if (pushDefault !== null) {
    if (names.includes(pushDefault)) return pushDefault;
    stop(EXIT_ASK_REMOTE, [
      `remote.pushDefault names \`${pushDefault}\`, which is no configured remote.`,
      "Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun.",
    ]);
  }
  if (names.length === 1) return names[0];
  if (names.length === 0) stop(EXIT_WRONG_REPOSITORY, ["No remote is configured."]);
  return stop(EXIT_ASK_REMOTE, [
    `Several remotes are configured (${names.join(", ")}) and remote.pushDefault is unset.`,
    "Ask which remote hosts the PRs, run `git config remote.pushDefault <name>`, then rerun.",
  ]);
}

function remoteRepository(remotes, remote) {
  const url = remotes.urls.get(remote)?.url;
  const repository = url === undefined ? null : parseRepositoryUrl(url);
  if (!repository)
    stop(EXIT_WRONG_REPOSITORY, [`\`${remote}\` (\`${url ?? ""}\`) names no GitHub repository.`]);
  return repository;
}

function checkPushUrls(remotes, remote, repository) {
  for (const pushUrl of remotes.urls.get(remote)?.pushUrls ?? []) {
    const pushed = parseRepositoryUrl(pushUrl);
    if (!pushed)
      stop(EXIT_WRONG_REPOSITORY, [`\`${remote}\` (\`${pushUrl}\`) names no GitHub repository.`]);
    const hostDiffers = repository.web && pushed.web && !sameHost(repository.host, pushed.host);
    if (!sameRepository(repository, pushed) || hostDiffers)
      stop(EXIT_WRONG_REPOSITORY, [
        `\`${remote}\` fetches from \`${fullName(repository)}\` but pushes to \`${fullName(pushed)}\`. ` +
          "`gh stack` opens PRs where it fetches. Point both URLs at one repository.",
      ]);
  }
}

function checkOtherSources(remotes, remote, repository) {
  for (const [other, { url, pushUrls }] of remotes.urls) {
    if (other === remote) continue;
    for (const candidate of [url, ...pushUrls]) {
      const named = candidate === undefined ? null : parseRepositoryUrl(candidate);
      if (named && !sameRepository(named, repository))
        stop(EXIT_WRONG_REPOSITORY, [
          `Remote \`${other}\` names \`${fullName(named)}\`, but \`${remote}\` names \`${fullName(repository)}\`. ` +
            "`gh stack` picks its API repository from all remotes. Use a clone whose remotes name " +
            `one repository, or set \`GH_REPO\` to \`${fullName(repository)}\`.`,
        ]);
    }
  }
  for (const { value } of remotes.ghResolved) {
    if (value === "base") continue;
    const parts = value.split("/");
    const named = { owner: parts.at(-2) ?? "", name: parts.at(-1) ?? "" };
    if (!sameRepository(named, repository))
      stop(EXIT_WRONG_REPOSITORY, [
        `\`gh repo set-default\` names \`${value}\`, but \`${remote}\` names \`${fullName(repository)}\`. ` +
          "Change it with `gh repo set-default`.",
      ]);
  }
}

function checkGhRepository(view, remote, repository) {
  const [owner, name] = String(view?.nameWithOwner ?? "").split("/");
  let webHost;
  try {
    webHost = new URL(String(view?.url)).hostname;
  } catch {
    stop(EXIT_FAILED, [`\`gh repo view\` printed no repository URL.`]);
  }
  const named = { owner: owner ?? "", name: name ?? "" };
  const hostDiffers = repository.web && !sameHost(repository.host, webHost);
  if (!sameRepository(named, repository) || hostDiffers)
    stop(EXIT_WRONG_REPOSITORY, [
      `\`gh repo view\` names \`${webHost}/${fullName(named)}\`, but \`${remote}\` names ` +
        `\`${repository.host}/${fullName(repository)}\`. Use a clone whose remotes name one ` +
        "repository, and a `GH_REPO` that names it or none.",
    ]);
  return {
    host: requireAllowedName(webHost, "Host"),
    owner: requireAllowedName(owner, "Owner"),
    name: requireAllowedName(name, "Repository"),
    defaultBranch: requireAllowedName(view?.defaultBranchRef?.name, "Default branch"),
  };
}

// The shell: every spawn goes through runGit or runGh.

function runGit(args, allowedExits = [0]) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  if (result.error) stop(EXIT_FAILED, [`could not run git ${args[0]}: ${result.error.message}`]);
  if (!allowedExits.includes(result.status))
    stop(EXIT_FAILED, [`git ${args.join(" ")} exited ${result.status}.`], result.stderr);
  return result;
}

function ghEnvironment() {
  const environment = { ...process.env };
  delete environment.GH_FORCE_TTY;
  delete environment.GH_STACK_NO_ATOMIC;
  return environment;
}

function ghJson(args, label) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: ghEnvironment(),
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  if (result.error) stop(EXIT_FAILED, [`could not run gh: ${result.error.message}`]);
  if (result.status !== 0) stop(EXIT_FAILED, [`${label} exited ${result.status}.`], result.stderr);
  try {
    return JSON.parse(result.stdout);
  } catch {
    return stop(EXIT_FAILED, [`${label} printed no JSON.`], result.stderr);
  }
}

function gitConfigEntries(pattern) {
  const result = runGit(["config", "--null", "--get-regexp", pattern], [0, GIT_CONFIG_NOT_SET]);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const newline = entry.indexOf("\n");
      return { key: entry.slice(0, newline), value: entry.slice(newline + 1) };
    });
}

function readRemotes() {
  const names = runGit(["remote"]).stdout.split("\n").filter(Boolean);
  const urls = new Map(names.map((name) => [name, { url: undefined, pushUrls: [] }]));
  for (const { key, value } of gitConfigEntries("^remote\\..+\\.(url|pushurl)$")) {
    const [, remote, kind] = /^remote\.(.+)\.(url|pushurl)$/.exec(key);
    if (!urls.has(remote)) urls.set(remote, { url: undefined, pushUrls: [] });
    const entry = urls.get(remote);
    if (kind === "pushurl") entry.pushUrls.push(value);
    else entry.url ??= value;
  }
  const pushDefault = runGit(["config", "--get", "remote.pushDefault"], [0, GIT_CONFIG_NOT_SET]);
  const ghResolved = gitConfigEntries("^remote\\..+\\.gh-resolved$").map(({ key, value }) => ({
    remote: /^remote\.(.+)\.gh-resolved$/.exec(key)[1],
    value,
  }));
  return {
    names,
    urls,
    pushDefault: pushDefault.status === 0 ? pushDefault.stdout.trim() : null,
    ghResolved,
  };
}

// The repository test: the remote's URLs, then every other source, then gh.
function confirmRepository(remotes, remote) {
  const repository = remoteRepository(remotes, remote);
  checkPushUrls(remotes, remote, repository);
  if (!process.env.GH_REPO) checkOtherSources(remotes, remote, repository);
  const view = ghJson(
    ["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef"],
    "gh repo view",
  );
  return checkGhRepository(view, remote, repository);
}

function repoCommand() {
  const remotes = readRemotes();
  for (const name of remotes.names) requireAllowedName(name, "Remote name");
  const remote = pickRemote(remotes);
  const repository = confirmRepository(remotes, remote);
  return [
    `REMOTE=${remote}`,
    `REPO=${repository.host}/${fullName(repository)}`,
    `DEFAULT=${repository.defaultBranch}`,
  ];
}

function main(args) {
  if (args.length === 1 && args[0] === "repo") return repoCommand();
  return stop(EXIT_USAGE, USAGE);
}

try {
  const lines = main(process.argv.slice(2));
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exitCode = EXIT_PASS;
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  const wrapped = error.wrappedStderr;
  process.stderr.write(
    `${error.reasons.map((reason) => `${SCRIPT}: ${reason}`).join("\n")}\n` +
      (wrapped ? (wrapped.endsWith("\n") ? wrapped : `${wrapped}\n`) : "") +
      `see ${DOC_PATH}\n`,
  );
  process.exitCode = error.exitCode;
}
