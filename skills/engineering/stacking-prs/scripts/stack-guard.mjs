#!/usr/bin/env node

/**
 * Runs the deterministic gates of a gh stack run. Run it from inside the
 * repository, with stdout sent to a file, never piped:
 *
 *     node "<skill-dir>/scripts/stack-guard.mjs" repo > <out-file>
 *     node "<skill-dir>/scripts/stack-guard.mjs" check --remote <remote> > <out-file>
 *     node "<skill-dir>/scripts/stack-guard.mjs" check --remote <remote> --trunk <trunk> <branch>... > <out-file>
 *     node "<skill-dir>/scripts/stack-guard.mjs" compare <record> > <out-file>
 *     node "<skill-dir>/scripts/stack-guard.mjs" after-submit <record> > <out-file>
 *
 * Requires `git` and `gh` (authenticated) on PATH. Every gh call runs with
 * GH_FORCE_TTY and GH_STACK_NO_ATOMIC removed from its environment, and with
 * GH_REPO kept, so the script sees the repository `gh stack` sees. Every gh
 * call but the `gh repo view` that finds the repository names it.
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
 * check --remote <remote>                              (stack mode)
 * check --remote <remote> --trunk <trunk> <branch>...  (named mode)
 *   Runs repo's repository test against <remote>. Stack mode reads
 *   `gh stack view --json`, one GraphQL query for the viewer and every
 *   layer's PRs, the GitHub stack (Stacks REST API), and one GraphQL query
 *   for that stack's PRs on no layer. Named mode reads the named branches,
 *   which no stack holds yet, the same way, with no `gh stack` call. Takes
 *   each PR's state from GitHub, not from `view --json`. Stops when another
 *   worktree holds a tested branch. Then fetches <remote> once and tests each
 *   active layer (not merged, not queued) against its remote copy: absent
 *   or ahead passes, behind fast-forwards (`git merge --ff-only` on the
 *   current branch, `git fetch .` on another). Writes the record that
 *   compare and after-submit read, in a new directory under the system temp
 *   directory. On exit 0 prints, lists comma-separated:
 *
 *     REMOTE, REPO  as repo prints them
 *     TRUNK         the stack's trunk, or --trunk
 *     RECORD        the record's path
 *     FORWARDED     layers check fast-forwarded
 *     REMOTE_ONLY   stack mode: PR numbers on the GitHub stack whose
 *                   branches no layer has, each the viewer's own and open
 *     NO_PR         stack mode: active layers with no open PR
 *     STACKED       named mode: named branches whose open PR is already in
 *                   a GitHub stack
 *
 * compare <record>
 *   Fetches the record's remote, then reads `view --json`, the layer PRs,
 *   and the GitHub stack. Passes, printing nothing, when every recorded
 *   remote tip (`absent` included), PR, and PR state, every merged layer's
 *   local tip, and the GitHub stack's unmerged PRs are unchanged, and no
 *   unrecorded layer has a PR or a remote branch.
 *
 * after-submit <record>
 *   Reads `view --json`, the layer PRs, and the GitHub stack of the top
 *   active layer's PR. Passes when every active layer has an open PR and the
 *   stack's unmerged PRs equal the active layers' PRs, bottom to top. On
 *   exit 0 prints STACK=<number>.
 *
 * Exit codes, each failure with its reason on stderr, then any wrapped
 * command's stderr, then a last line `see <recovery.md>`:
 *
 *   0  pass
 *   1  a git or gh command failed (a refused `git merge --ff-only`
 *      included), gh printed no JSON, a name failed the allowlist
 *      ^[A-Za-z0-9._/-]+$ (no leading -), a query page filled, `view --json`
 *      disagrees with GitHub, <remote>/<trunk> is missing in stack mode, or
 *      the Stacks REST API answered 404 (stacked PRs are off)
 *   2  wrong arguments, a --remote that names no remote, a named branch
 *      missing locally, no <remote>/<trunk> in named mode, or an unreadable
 *      record
 *   3  check: another worktree holds a tested branch, or a PR by another
 *      author (or none), a closed or queued PR, or a branch with two open PRs
 *   4  check: a layer's remote copy has commits the local layer lacks
 *   5  compare: a recorded tip, PR, PR state, merged layer's local tip, or
 *      the GitHub stack's PRs changed, or a new layer appeared on the remote
 *   6  after-submit: an active layer has no open PR
 *   7  repo: several remotes and no remote.pushDefault, or a pushDefault that
 *      names no configured remote
 *   8  repo, check: no remote, a remote URL or pushurl that names no GitHub
 *      repository, or another source that names a different repository
 *   9  after-submit: the top PR is in no GitHub stack, or that stack lacks,
 *      adds, or reorders PRs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "stack-guard.mjs";
const DOC_PATH = fileURLToPath(new URL("../references/recovery.md", import.meta.url));
const USAGE = [
  `usage: node ${SCRIPT} repo > <out-file>`,
  `       node ${SCRIPT} check --remote <remote> > <out-file>`,
  `       node ${SCRIPT} check --remote <remote> --trunk <trunk> <branch>... > <out-file>`,
  `       node ${SCRIPT} compare <record> > <out-file>`,
  `       node ${SCRIPT} after-submit <record> > <out-file>`,
];

const EXIT_PASS = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_NOT_PUBLISHABLE = 3;
const EXIT_REMOTE_COMMITS = 4;
const EXIT_CHANGED = 5;
const EXIT_NO_OPEN_PR = 6;
const EXIT_ASK_REMOTE = 7;
const EXIT_WRONG_REPOSITORY = 8;
const EXIT_STACK_MISMATCH = 9;

// `git config` exits 1 when the key or pattern matches nothing.
const GIT_CONFIG_NOT_SET = 1;
// `git merge-base --is-ancestor` exits 1 when the first commit is not an ancestor.
const NOT_ANCESTOR = 1;
// `git rev-parse --verify --quiet` exits 1 when the ref does not exist.
const NO_SUCH_REF = 1;
// GraphQL's largest page. A full page can hide older PRs, so it stops the run.
const PAGE_SIZE = 100;
// Large enough for a GraphQL answer of 100 pull requests per branch.
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const ABSENT = "absent";
const PULL_FIELDS = "number state isCrossRepository author { login } mergeQueueEntry { id }";

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

function runGh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: ghEnvironment(),
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  if (result.error) stop(EXIT_FAILED, [`could not run gh: ${result.error.message}`]);
  return result;
}

function ghJson(args, label) {
  const result = runGh(args);
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

// Pure decisions over the layer read and the GitHub stack.

function normalizePull(node) {
  return {
    number: node.number,
    state: node.state,
    queued: node.mergeQueueEntry !== null && node.mergeQueueEntry !== undefined,
    author: node.author?.login ?? null,
    crossRepository: node.isCrossRepository === true,
  };
}

// The tracked PR, else the open one, else the newest when it is closed. An untracked merged
// PR counts as none, because a merged PR's branch name can be reused.
function choosePull(pulls, trackedNumber) {
  const tracked = pulls.find((pull) => pull.number === trackedNumber);
  if (tracked) return tracked;
  const open = pulls.find((pull) => pull.state === "OPEN");
  if (open) return open;
  return pulls[0]?.state === "CLOSED" ? pulls[0] : null;
}

function classifyLayers(branches, pullsByBranch) {
  return branches.map((branch) => {
    const pulls = pullsByBranch.get(branch.name) ?? [];
    const pull = choosePull(pulls, branch.pr?.number);
    const merged = pull?.state === "MERGED";
    const queued = pull?.queued === true;
    return { name: branch.name, view: branch, pulls, pull, merged, active: !merged && !queued };
  });
}

// The lowest active layer with an open PR, else the top merged layer's PR.
function stackPickNumber(layers) {
  const open = layers.find((layer) => layer.active && layer.pull?.state === "OPEN");
  if (open) return open.pull.number;
  return layers.findLast((layer) => layer.merged)?.pull.number ?? null;
}

function unmergedStackNumbers(stack) {
  return stack === null
    ? []
    : stack.pulls.filter((pull) => !pull.merged).map((pull) => pull.number);
}

function ownershipStops(publishable, layers, viewer) {
  const reasons = [];
  for (const { pull, branch } of publishable) {
    if (pull.author === null)
      reasons.push(
        `PR #${pull.number} (\`${branch}\`) has no author, as from a deleted account. ` +
          "This skill changes and publishes only your own PRs.",
      );
    else if (pull.author.toLowerCase() !== viewer.toLowerCase())
      reasons.push(
        `PR #${pull.number} (\`${branch}\`) is by \`${pull.author}\`. ` +
          "This skill changes and publishes only your own PRs.",
      );
    if (pull.state === "CLOSED")
      reasons.push(
        `PR #${pull.number} on \`${branch}\` is closed. Reopen it, or put the work on a new ` +
          "branch name (for a stack layer, through restructuring).",
      );
    if (pull.queued)
      reasons.push(
        `PR #${pull.number} is in the merge queue. Rerun after it merges or leaves the queue.`,
      );
  }
  for (const layer of layers) {
    const open = layer.pulls.filter((pull) => pull.state === "OPEN");
    if (open.length > 1)
      reasons.push(
        `\`${layer.name}\` has open PRs ${open.map((pull) => `#${pull.number}`).join(" and ")}. ` +
          "Close one, then rerun.",
      );
  }
  return reasons;
}

function viewDisagreements(layers) {
  const reasons = [];
  for (const layer of layers) {
    const shown = layer.view.pr?.number;
    const named = `\`${layer.name}\`${shown === undefined ? "" : ` (PR #${shown})`}`;
    if (shown !== undefined && layer.pull?.number !== shown)
      reasons.push(
        `\`gh stack view --json\` shows PR #${shown} on \`${layer.name}\`, but GitHub shows ` +
          `${layer.pull ? `#${layer.pull.number}` : "none"}.`,
      );
    if ((layer.view.isMerged === true) !== layer.merged)
      reasons.push(
        `\`gh stack view --json\` shows ${named} ${layer.merged ? "unmerged" : "merged"}, but ` +
          `GitHub shows it ${layer.merged ? "merged" : "unmerged"}.`,
      );
    if ((layer.view.isQueued === true) !== (layer.pull?.queued === true))
      reasons.push(
        `\`gh stack view --json\` and GitHub disagree on whether ${named} is in the merge queue.`,
      );
  }
  return reasons;
}

function sameNumbers(left, right) {
  return left.length === right.length && left.every((number, index) => number === right[index]);
}

function numberList(numbers) {
  return numbers.length === 0 ? "none" : numbers.map((number) => `#${number}`).join(", ");
}

// Reads of git, gh stack, and GitHub.

function refTip(ref) {
  const result = runGit(["rev-parse", "--verify", "--quiet", ref], [0, NO_SUCH_REF]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function isAncestor(ancestor, descendant) {
  const result = runGit(["merge-base", "--is-ancestor", ancestor, descendant], [0, NOT_ANCESTOR]);
  return result.status === 0;
}

function fetchRemote(remote) {
  runGit(["fetch", "--quiet", remote]);
}

function remoteRef(remote, branch) {
  return `refs/remotes/${remote}/${branch}`;
}

function readStackView() {
  const view = ghJson(["stack", "view", "--json"], "gh stack view --json");
  if (!Array.isArray(view?.branches))
    stop(EXIT_FAILED, ["`gh stack view --json` printed no branches list."]);
  requireAllowedName(view.trunk, "Trunk");
  for (const branch of view.branches) requireAllowedName(branch?.name, "Layer");
  return view;
}

function readLayerPulls(repository, branches) {
  const variables = branches.map((branch, index) => [`branch${index}`, branch]);
  const declarations = [
    "$owner: String!",
    "$name: String!",
    ...variables.map(([variable]) => `$${variable}: String!`),
  ];
  const selections = variables.map(
    ([variable]) =>
      `${variable}: pullRequests(headRefName: $${variable}, states: [OPEN, CLOSED, MERGED], ` +
      `first: ${PAGE_SIZE}, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${PULL_FIELDS} } }`,
  );
  const repositoryField =
    selections.length === 0
      ? ""
      : ` repository(owner: $owner, name: $name) { ${selections.join(" ")} }`;
  const query = `query(${declarations.join(", ")}) { viewer { login }${repositoryField} }`;
  const answer = ghJson(
    [
      "api",
      "graphql",
      "--hostname",
      repository.host,
      "-f",
      `query=${query}`,
      "-f",
      `owner=${repository.owner}`,
      "-f",
      `name=${repository.name}`,
      ...variables.flatMap(([variable, branch]) => ["-f", `${variable}=${branch}`]),
    ],
    "gh api graphql (layer PRs)",
  );
  const viewer = answer?.data?.viewer?.login;
  if (typeof viewer !== "string") stop(EXIT_FAILED, ["The layer PR query returned no viewer."]);
  const pullsByBranch = new Map();
  for (const [variable, branch] of variables) {
    const nodes = answer.data.repository?.[variable]?.nodes;
    if (!Array.isArray(nodes))
      stop(EXIT_FAILED, [`The layer PR query returned no PR list for \`${branch}\`.`]);
    if (nodes.length >= PAGE_SIZE)
      stop(EXIT_FAILED, [
        `\`${branch}\` has ${PAGE_SIZE} or more PRs, a full query page, so older ones are unseen.`,
      ]);
    pullsByBranch.set(
      branch,
      nodes.map(normalizePull).filter((pull) => !pull.crossRepository),
    );
  }
  return { viewer, pullsByBranch };
}

function readGitHubStack(repository, pullNumber) {
  if (pullNumber === null) return null;
  const endpoint = `repos/${repository.owner}/${repository.name}/stacks?pull_request=${pullNumber}`;
  const result = runGh(["api", "--hostname", repository.host, endpoint]);
  if (result.status !== 0 && /HTTP 404/.test(result.stderr))
    stop(
      EXIT_FAILED,
      [
        `The Stacks REST API answered 404 for PR #${pullNumber}, so stacked PRs are off for ` +
          `${repository.owner}/${repository.name}.`,
      ],
      result.stderr,
    );
  if (result.status !== 0)
    stop(EXIT_FAILED, [`gh api ${endpoint} exited ${result.status}.`], result.stderr);
  let entries;
  try {
    entries = JSON.parse(result.stdout);
  } catch {
    stop(EXIT_FAILED, [`gh api ${endpoint} printed no JSON.`], result.stderr);
  }
  if (!Array.isArray(entries)) stop(EXIT_FAILED, [`gh api ${endpoint} printed no stack list.`]);
  const entry = entries[0];
  if (entry === undefined) return null;
  if (!Number.isInteger(entry.number) || !Array.isArray(entry.pull_requests))
    stop(EXIT_FAILED, [`gh api ${endpoint} printed a stack with no number or PR list.`]);
  return {
    number: entry.number,
    pulls: entry.pull_requests.map((pull) => ({
      number: pull.number,
      branch: requireAllowedName(pull.head?.ref, "Stack PR branch"),
      merged: pull.merged_at !== null && pull.merged_at !== undefined,
    })),
  };
}

// The stack's unmerged PRs on no layer, read in one query.
function readOutsidePulls(repository, stack, layerNames) {
  const outside = (stack?.pulls ?? []).filter(
    (pull) => !pull.merged && !layerNames.includes(pull.branch),
  );
  if (outside.length === 0) return [];
  const variables = outside.map((pull, index) => [`pull${index}`, pull]);
  const declarations = [
    "$owner: String!",
    "$name: String!",
    ...variables.map(([variable]) => `$${variable}: Int!`),
  ];
  const selections = variables.map(
    ([variable]) => `${variable}: pullRequest(number: $${variable}) { ${PULL_FIELDS} }`,
  );
  const query =
    `query(${declarations.join(", ")}) { repository(owner: $owner, name: $name) ` +
    `{ ${selections.join(" ")} } }`;
  const answer = ghJson(
    [
      "api",
      "graphql",
      "--hostname",
      repository.host,
      "-f",
      `query=${query}`,
      "-f",
      `owner=${repository.owner}`,
      "-f",
      `name=${repository.name}`,
      ...variables.flatMap(([variable, pull]) => ["-F", `${variable}=${pull.number}`]),
    ],
    "gh api graphql (stack PRs)",
  );
  return variables.map(([variable, { branch, number }]) => {
    const node = answer?.data?.repository?.[variable];
    if (!node) stop(EXIT_FAILED, [`The stack PR query returned nothing for PR #${number}.`]);
    return { pull: normalizePull(node), branch };
  });
}

// The layers and GitHub stack as GitHub sees them now.
function surveyStack(repository, view, extraBranches = []) {
  const layerNames = view.branches.map((branch) => branch.name);
  const names = [...new Set([...layerNames, ...extraBranches])];
  const { viewer, pullsByBranch } = readLayerPulls(repository, names);
  const layers = classifyLayers(view.branches, pullsByBranch);
  const stack = readGitHubStack(repository, stackPickNumber(layers));
  return { viewer, pullsByBranch, layers, stack };
}

function writeRecord(record) {
  const directory = mkdtempSync(join(tmpdir(), "stack-guard-"));
  const path = join(directory, "record.json");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

function readRecord(path) {
  let record;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    stop(EXIT_USAGE, [`Cannot read the record \`${path}\`: ${error.message}`]);
  }
  const entries = [record?.layers, record?.remoteOnly, record?.merged];
  const repositoryParts = String(record?.repository ?? "").split("/");
  const wellFormed =
    isAllowedName(record?.remote) &&
    isAllowedName(record?.trunk) &&
    repositoryParts.length === 3 &&
    repositoryParts.every(isAllowedName) &&
    entries.every(
      (list) => Array.isArray(list) && list.every((entry) => isAllowedName(entry?.branch)),
    ) &&
    (record.stack === null || Array.isArray(record.stack?.pulls));
  if (!wellFormed) stop(EXIT_USAGE, [`\`${path}\` is not a record that \`check\` wrote.`]);
  const [host, owner, name] = repositoryParts;
  return { ...record, repository: { host, owner, name } };
}

function pullEntry(branch, pull, remote) {
  return {
    branch,
    remoteTip: refTip(remoteRef(remote, branch)) ?? ABSENT,
    pr: pull?.number ?? null,
    state: pull?.state ?? null,
    queued: pull?.queued === true,
  };
}

// The subcommands.

// /tmp and /private/tmp name one directory on macOS, so worktree paths compare as real paths.
function realPath(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return path;
    throw error;
  }
}

function otherWorktreeHolders(branchNames) {
  const current = realPath(runGit(["rev-parse", "--show-toplevel"]).stdout.trim());
  const holders = [];
  for (const block of runGit(["worktree", "list", "--porcelain"]).stdout.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    const branch = lines
      .find((line) => line.startsWith("branch refs/heads/"))
      ?.slice("branch refs/heads/".length);
    if (path === undefined || !branchNames.includes(branch)) continue;
    if (realPath(path) !== current) holders.push({ path, branch });
  }
  return holders;
}

function fastForward(remote, branch, currentBranch) {
  if (branch === currentBranch)
    runGit(["merge", "--ff-only", "--quiet", remoteRef(remote, branch)]);
  else runGit(["fetch", "--quiet", ".", `${remoteRef(remote, branch)}:refs/heads/${branch}`]);
}

// The remote-tip test: absent and ahead pass, behind fast-forwards, anything else stops.
function testRemoteTips(remote, layers) {
  const currentBranch = runGit(["branch", "--show-current"]).stdout.trim();
  const forwarded = [];
  const lacking = [];
  for (const layer of layers) {
    const remoteCopy = remoteRef(remote, layer.name);
    const local = `refs/heads/${layer.name}`;
    if (refTip(remoteCopy) === null || isAncestor(remoteCopy, local)) continue;
    if (isAncestor(local, remoteCopy)) {
      fastForward(remote, layer.name, currentBranch);
      forwarded.push(layer.name);
      continue;
    }
    lacking.push(`\`${layer.name}\` has commits on \`${remote}\` that the local layer lacks.`);
  }
  if (lacking.length > 0) stop(EXIT_REMOTE_COMMITS, lacking);
  return { forwarded };
}

function surveyNamed(repository, branches) {
  const { viewer, pullsByBranch } = readLayerPulls(repository, branches);
  const layers = classifyLayers(
    branches.map((name) => ({ name })),
    pullsByBranch,
  );
  const stacks = layers
    .filter((layer) => layer.pull?.state === "OPEN")
    .map((layer) => ({ layer, stack: readGitHubStack(repository, layer.pull.number) }))
    .filter(({ stack }) => stack !== null);
  return { viewer, layers, stacks };
}

function checkCommand({ remote, trunk, branches }) {
  const named = branches !== undefined;
  requireAllowedName(remote, "Remote name");
  if (named) {
    requireAllowedName(trunk, "Trunk");
    for (const branch of branches) requireAllowedName(branch, "Branch");
  }
  const remotes = readRemotes();
  if (!remotes.names.includes(remote))
    stop(EXIT_USAGE, [`--remote \`${remote}\` names no configured remote.`]);
  const repository = confirmRepository(remotes, remote);

  let survey;
  let disagreements = [];
  if (named) {
    const missing = branches.filter((branch) => refTip(`refs/heads/${branch}`) === null);
    if (missing.length > 0)
      stop(
        EXIT_USAGE,
        missing.map((branch) => `Branch \`${branch}\` does not exist locally.`),
      );
    const { viewer, layers, stacks } = surveyNamed(repository, branches);
    const outside = stacks.flatMap(({ stack }) => readOutsidePulls(repository, stack, branches));
    survey = { viewer, layers, outside, stacks, trunk, stack: stacks[0]?.stack ?? null };
  } else {
    const view = readStackView();
    const { viewer, layers, stack } = surveyStack(repository, view);
    const layerNames = layers.map((layer) => layer.name);
    const outside = readOutsidePulls(repository, stack, layerNames);
    survey = { viewer, layers, outside, stack, trunk: view.trunk };
    disagreements = viewDisagreements(layers);
  }
  const { viewer, layers, outside, stack } = survey;
  const publishable = [
    ...layers
      .filter((layer) => !layer.merged && layer.pull !== null)
      .map((layer) => ({ pull: layer.pull, branch: layer.name })),
    ...outside,
  ];
  const stops = ownershipStops(publishable, layers, viewer);
  const active = layers.filter((layer) => layer.active);
  for (const { path, branch } of otherWorktreeHolders(active.map((layer) => layer.name)))
    stops.push(
      `\`${branch}\` is checked out in \`${path}\`, which another session can use. ` +
        "Switch that worktree to another branch, then rerun.",
    );
  if (stops.length > 0) stop(EXIT_NOT_PUBLISHABLE, stops);
  if (disagreements.length > 0) stop(EXIT_FAILED, [...disagreements, "Rerun check once."]);

  fetchRemote(remote);
  if (refTip(remoteRef(remote, survey.trunk)) === null)
    stop(named ? EXIT_USAGE : EXIT_FAILED, [
      `\`${remote}/${survey.trunk}\` does not exist after the fetch.`,
    ]);
  const { forwarded } = testRemoteTips(remote, active);

  const record = writeRecord({
    remote,
    repository: `${repository.host}/${fullName(repository)}`,
    trunk: survey.trunk,
    layers: active.map((layer) => pullEntry(layer.name, layer.pull, remote)),
    remoteOnly: outside.map(({ pull, branch }) => pullEntry(branch, pull, remote)),
    merged: layers
      .filter((layer) => layer.merged)
      .map((layer) => ({
        branch: layer.name,
        localTip: refTip(`refs/heads/${layer.name}`) ?? ABSENT,
        pr: layer.pull.number,
      })),
    stack: stack === null ? null : { number: stack.number, pulls: unmergedStackNumbers(stack) },
  });
  const common = [
    `REMOTE=${remote}`,
    `REPO=${repository.host}/${fullName(repository)}`,
    `TRUNK=${survey.trunk}`,
    `RECORD=${record}`,
    `FORWARDED=${forwarded.join(",")}`,
  ];
  if (named)
    return [...common, `STACKED=${survey.stacks.map(({ layer }) => layer.name).join(",")}`];
  return [
    ...common,
    `REMOTE_ONLY=${outside.map(({ pull }) => pull.number).join(",")}`,
    `NO_PR=${active
      .filter((layer) => layer.pull === null)
      .map((layer) => layer.name)
      .join(",")}`,
  ];
}

function compareCommand(recordPath) {
  const record = readRecord(recordPath);
  const { remote, repository } = record;
  fetchRemote(remote);
  const view = readStackView();
  const recorded = [...record.layers, ...record.remoteOnly];
  const recordedNames = new Set([...recorded, ...record.merged].map((entry) => entry.branch));
  const { pullsByBranch, layers, stack } = surveyStack(repository, view, [...recordedNames]);
  const trackedNumber = new Map(layers.map((layer) => [layer.name, layer.view.pr?.number]));
  const changes = [];

  for (const entry of recorded) {
    const pull = choosePull(
      pullsByBranch.get(entry.branch) ?? [],
      trackedNumber.get(entry.branch) ?? entry.pr,
    );
    const now = pullEntry(entry.branch, pull, remote);
    if (now.remoteTip !== entry.remoteTip) {
      changes.push(
        `\`${remote}/${entry.branch}\` moved from ${entry.remoteTip} to ${now.remoteTip}.`,
      );
      if (entry.remoteTip !== ABSENT && now.remoteTip !== ABSENT)
        changes.push(
          runGit([
            "log",
            "--oneline",
            `${entry.remoteTip}..${remoteRef(remote, entry.branch)}`,
          ]).stdout.trimEnd(),
        );
    }
    if (now.pr !== entry.pr || now.state !== entry.state || now.queued !== entry.queued)
      changes.push(
        `\`${entry.branch}\` had PR ${entry.pr === null ? "none" : `#${entry.pr} ${entry.state}`}` +
          `${entry.queued ? " queued" : ""}, and now has ` +
          `${now.pr === null ? "none" : `#${now.pr} ${now.state}`}${now.queued ? " queued" : ""}.`,
      );
  }
  for (const entry of record.merged) {
    const localTip = refTip(`refs/heads/${entry.branch}`) ?? ABSENT;
    if (localTip !== entry.localTip)
      changes.push(
        `Merged layer \`${entry.branch}\` moved locally from ${entry.localTip} to ${localTip}.`,
      );
  }
  for (const layer of layers) {
    if (recordedNames.has(layer.name) || layer.merged) continue;
    if (layer.pull !== null || refTip(remoteRef(remote, layer.name)) !== null)
      changes.push(
        `\`${layer.name}\` is a new layer with ` +
          `${layer.pull ? `PR #${layer.pull.number}` : `a branch on \`${remote}\``}.`,
      );
  }
  const stackNow = unmergedStackNumbers(stack);
  const stackBefore = record.stack?.pulls ?? [];
  if (!sameNumbers(stackNow, stackBefore))
    changes.push(
      `The GitHub stack's unmerged PRs were ${numberList(stackBefore)}, and are now ` +
        `${numberList(stackNow)}.`,
    );
  if (changes.length > 0) stop(EXIT_CHANGED, [...changes, "Nothing was pushed."]);
  return [];
}

function afterSubmitCommand(recordPath) {
  const { repository } = readRecord(recordPath);
  const view = readStackView();
  const { layers } = surveyStack(repository, view);
  const active = layers.filter((layer) => layer.active);
  const withoutPull = active.filter((layer) => layer.pull?.state !== "OPEN");
  if (withoutPull.length > 0)
    stop(
      EXIT_NO_OPEN_PR,
      withoutPull.map((layer) => `Active layer \`${layer.name}\` has no open PR.`),
    );
  const top = active.at(-1);
  if (top === undefined) stop(EXIT_STACK_MISMATCH, ["The stack has no active layer."]);
  const stack = readGitHubStack(repository, top.pull.number);
  if (stack === null)
    stop(EXIT_STACK_MISMATCH, [`PR #${top.pull.number} (\`${top.name}\`) is in no GitHub stack.`]);
  const expected = active.map((layer) => layer.pull.number);
  const actual = unmergedStackNumbers(stack);
  if (!sameNumbers(actual, expected))
    stop(EXIT_STACK_MISMATCH, [
      `GitHub stack #${stack.number} holds unmerged PRs ${numberList(actual)}, but the active ` +
        `layers' PRs bottom to top are ${numberList(expected)}.`,
    ]);
  return [`STACK=${stack.number}`];
}

function main(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "repo" && rest.length === 0) return repoCommand();
  if (subcommand === "check" && rest.length === 2 && rest[0] === "--remote")
    return checkCommand({ remote: rest[1] });
  if (subcommand === "check" && rest.length >= 5 && rest[0] === "--remote" && rest[2] === "--trunk")
    return checkCommand({ remote: rest[1], trunk: rest[3], branches: rest.slice(4) });
  if (subcommand === "compare" && rest.length === 1) return compareCommand(rest[0]);
  if (subcommand === "after-submit" && rest.length === 1) return afterSubmitCommand(rest[0]);
  return stop(EXIT_USAGE, USAGE);
}

try {
  const lines = main(process.argv.slice(2));
  if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
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
