// Fails when stack-guard.mjs picks a remote the user did not name, passes a clone whose
// remotes, pushurl, gh-resolved value, or GH_REPO name another repository, or lets
// GH_FORCE_TTY or GH_STACK_NO_ATOMIC reach gh (repo); when check passes another author's,
// a closed, a queued, or a doubled PR, trusts view --json over GitHub, reads the wrong
// GitHub stack, repeats a GitHub read, fast-forwards a branch another worktree holds, or
// passes a layer whose remote commits have no local copy (check); when compare misses a
// moved tip, PR, stack, or new layer; or when after-submit or after-sync report success on
// a stack GitHub does not match.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/engineering/stacking-prs/scripts/stack-guard.mjs");
const HOST = "github.acme.invalid";
const ORIGIN_URL = "https://github.acme.invalid/acme/invoices";
const REPO = "github.acme.invalid/acme/invoices";
const REAL_GIT = spawnSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

// Git with no user or system config, and no gh variables from the developer's shell.
const BASE_ENV = (() => {
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GH_REPO",
    "GH_HOST",
    "GH_FORCE_TTY",
    "GH_STACK_NO_ATOMIC",
  ])
    delete env[key];
  return env;
})();

// Logs each git call the script makes, one record per call, then runs the real git.
const GIT_WRAPPER = `#!/usr/bin/env bash
{ printf 'git'; printf '\\x1f%s' "$@"; printf '\\x1e'; } >>"$FAKE_GIT_LOG"
exec ${JSON.stringify(REAL_GIT)} "$@"
`;

// The fake gh. It runs as its own program, serialized with Function.prototype.toString, so
// it uses only its parameter and Node built-ins. It logs argv and the D6 variables, rejects
// a plain gh call without --repo or --hostname (gh repo view and gh stack excepted), and
// answers from the scenario file: gh repo view, gh stack view --json, the Stacks REST API,
// and GraphQL queries, which it executes against the scenario's pull requests.
function fakeGh(require) {
  const { appendFileSync, readFileSync, writeSync } = require("node:fs");
  const argv = process.argv.slice(2);
  appendFileSync(
    process.env.FAKE_GH_LOG,
    `${JSON.stringify({
      argv,
      env: {
        GH_FORCE_TTY: process.env.GH_FORCE_TTY ?? "",
        GH_STACK_NO_ATOMIC: process.env.GH_STACK_NO_ATOMIC ?? "",
        GH_REPO: process.env.GH_REPO ?? "",
      },
    })}\n`,
  );
  const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, "utf8"));
  // Synchronous writes, because process.exit drops pipe writes still queued.
  const finish = (code, stdout, stderr) => {
    writeSync(1, stdout);
    writeSync(2, stderr);
    process.exit(code);
  };
  const reject = (message) => finish(1, "", `fake gh: ${message}\n`);
  const sameName = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();
  const [owner, name] = scenario.repository.split("/");

  function parseFlags(args, known) {
    const flags = [];
    const positional = [];
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (!arg.startsWith("-")) {
        positional.push(arg);
        continue;
      }
      const equals = arg.indexOf("=");
      const flag = equals === -1 ? arg : arg.slice(0, equals);
      if (!known.includes(flag)) reject(`unsupported flag ${flag} in: gh ${argv.join(" ")}`);
      index += equals === -1 ? 1 : 0;
      const value = equals === -1 ? args[index] : arg.slice(equals + 1);
      if (value === undefined) reject(`${flag} needs a value`);
      flags.push([flag, value]);
    }
    return { flags, positional };
  }

  if (argv[0] === "repo" && argv[1] === "view") {
    const { flags, positional } = parseFlags(argv.slice(2), ["--json"]);
    const view = scenario.repoView;
    if (view.exit) finish(view.exit, "", view.stderr);
    const target = positional[0] ?? process.env.GH_REPO;
    let answer = {
      nameWithOwner: view.nameWithOwner,
      url: view.url,
      defaultBranchRef: { name: view.defaultBranch },
    };
    if (target) {
      const parts = target.split("/");
      const nameWithOwner = parts.slice(-2).join("/");
      const host = parts.length === 3 ? parts[0] : "github.com";
      answer = {
        nameWithOwner,
        url: `https://${host}/${nameWithOwner}`,
        defaultBranchRef: { name: view.defaultBranch },
      };
    }
    const fields = flags.find(([flag]) => flag === "--json")?.[1];
    if (!fields) reject("gh repo view without --json");
    const output = {};
    for (const field of fields.split(",")) {
      if (!(field in answer)) reject(`Unknown JSON field: "${field}"`);
      output[field] = answer[field];
    }
    finish(0, `${JSON.stringify(output)}\n`, "");
  }

  if (argv[0] === "stack") {
    if (argv.length !== 3 || argv[1] !== "view" || argv[2] !== "--json")
      reject(`unexpected call: gh ${argv.join(" ")}`);
    const view = scenario.stackView;
    if (view.exit) finish(view.exit, "", view.stderr);
    finish(0, `${JSON.stringify(view, null, 2)}\n`, "");
  }

  if (!argv.some((arg) => /^(--repo|-R|--hostname)(=|$)/.test(arg)))
    reject("missing --repo or --hostname");
  if (argv[0] !== "api") reject(`unexpected call: gh ${argv.join(" ")}`);
  const { flags, positional } = parseFlags(argv.slice(1), [
    "--hostname",
    "-f",
    "--raw-field",
    "-F",
    "--field",
    "-X",
    "--method",
    "-H",
    "--header",
    "--input",
  ]);
  const flagValues = (...names) =>
    flags.filter(([flag]) => names.includes(flag)).map(([, value]) => value);
  const hostname = flagValues("--hostname")[0];
  if (!sameName(hostname, scenario.host)) reject(`--hostname ${hostname} is not ${scenario.host}`);
  if (positional.length !== 1) reject(`gh api needs one endpoint: gh ${argv.join(" ")}`);
  const endpoint = positional[0].replace(/^\//, "");
  const typedValue = (text) => {
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "null") return null;
    if (/^-?\d+$/.test(text)) return Number(text);
    if (text.startsWith("@")) return readFileSync(text === "@-" ? 0 : text.slice(1), "utf8");
    return text;
  };
  const fields = {};
  for (const raw of flagValues("-f", "--raw-field")) {
    const equals = raw.indexOf("=");
    fields[raw.slice(0, equals)] = raw.slice(equals + 1);
  }
  for (const typed of flagValues("-F", "--field")) {
    const equals = typed.indexOf("=");
    fields[typed.slice(0, equals)] = typedValue(typed.slice(equals + 1));
  }
  const input = flagValues("--input")[0];
  const method = (
    flagValues("-X", "--method")[0] ??
    (Object.keys(fields).length > 0 || input !== undefined ? "POST" : "GET")
  ).toUpperCase();

  function tokenize(source) {
    const tokens = [];
    const pattern =
      /[\s,]+|#[^\n]*|(\.\.\.|[{}()[\]:=!@$])|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|([_A-Za-z]\w*)/y;
    while (pattern.lastIndex < source.length) {
      const start = pattern.lastIndex;
      const match = pattern.exec(source);
      if (!match) throw new Error(`Parse error near "${source.slice(start, start + 12)}"`);
      if (match[1] !== undefined) tokens.push({ kind: "punctuator", value: match[1] });
      else if (match[2] !== undefined) tokens.push({ kind: "string", value: JSON.parse(match[2]) });
      else if (match[3] !== undefined) tokens.push({ kind: "number", value: Number(match[3]) });
      else if (match[4] !== undefined) tokens.push({ kind: "name", value: match[4] });
    }
    return tokens;
  }

  function parseDocument(source) {
    const tokens = tokenize(source);
    let position = 0;
    const peek = () => tokens[position];
    const take = () => {
      const token = tokens[position];
      if (!token) throw new Error("Parse error: unexpected end of query");
      position += 1;
      return token;
    };
    const isPunctuator = (value) => peek()?.kind === "punctuator" && peek().value === value;
    const expect = (value) => {
      const token = take();
      if (token.kind !== "punctuator" || token.value !== value)
        throw new Error(`Parse error: expected ${value}, got ${token.value}`);
    };
    function parseValue() {
      const token = take();
      if (token.kind === "punctuator" && token.value === "$") return { variable: take().value };
      if (token.kind === "punctuator" && token.value === "[") {
        const list = [];
        while (!isPunctuator("]")) list.push(parseValue());
        take();
        return { list };
      }
      if (token.kind === "punctuator" && token.value === "{") {
        const object = {};
        while (!isPunctuator("}")) {
          const key = take().value;
          expect(":");
          object[key] = parseValue();
        }
        take();
        return { object };
      }
      if (token.kind === "string" || token.kind === "number") return { literal: token.value };
      if (token.kind === "name") {
        const words = { true: true, false: false, null: null };
        return { literal: token.value in words ? words[token.value] : token.value };
      }
      throw new Error(`Parse error: unexpected ${token.value}`);
    }
    function parseSelections() {
      expect("{");
      const selections = [];
      while (!isPunctuator("}")) {
        if (isPunctuator("...")) throw new Error("fake gh supports no fragments");
        const first = take();
        if (first.kind !== "name") throw new Error(`Parse error: unexpected ${first.value}`);
        let fieldName = first.value;
        if (isPunctuator(":")) {
          take();
          fieldName = take().value;
        }
        const args = {};
        if (isPunctuator("(")) {
          take();
          while (!isPunctuator(")")) {
            const key = take().value;
            expect(":");
            args[key] = parseValue();
          }
          take();
        }
        if (isPunctuator("@")) throw new Error("fake gh supports no directives");
        const children = isPunctuator("{") ? parseSelections() : undefined;
        selections.push({ key: first.value, name: fieldName, args, children });
      }
      take();
      return selections;
    }
    const variableTypes = {};
    if (peek()?.kind === "name") {
      const keyword = take().value;
      if (keyword !== "query") throw new Error(`fake gh answers queries only, not ${keyword}`);
      if (peek()?.kind === "name") take();
      if (isPunctuator("(")) {
        take();
        while (!isPunctuator(")")) {
          expect("$");
          const variable = take().value;
          expect(":");
          let type = "";
          while (!isPunctuator(")") && !isPunctuator("$") && !isPunctuator("="))
            type += take().value;
          if (isPunctuator("=")) {
            take();
            parseValue();
          }
          variableTypes[variable] = type;
        }
        take();
      }
    }
    const selections = parseSelections();
    if (position !== tokens.length) throw new Error("Parse error: text after the query");
    return { variableTypes, selections };
  }

  function evaluate(value, context) {
    if ("variable" in value) {
      const type = context.variableTypes[value.variable];
      if (type === undefined) throw new Error(`Variable $${value.variable} is not declared`);
      const provided = context.variables[value.variable];
      const invalid = `Variable $${value.variable} of type ${type} was provided invalid value`;
      if (provided === undefined || provided === null) {
        if (type.endsWith("!")) throw new Error(invalid);
        return null;
      }
      if (type.replace(/[[\]!]/g, "") === "Int" && !Number.isInteger(provided))
        throw new Error(invalid);
      return provided;
    }
    if ("list" in value) return value.list.map((item) => evaluate(item, context));
    if ("object" in value)
      return Object.fromEntries(
        Object.entries(value.object).map(([key, item]) => [key, evaluate(item, context)]),
      );
    return value.literal;
  }

  function resolveSelections(selections, object, context) {
    const result = {};
    for (const field of selections) {
      if (field.name === "__typename") {
        result[field.key] = object.__typename;
        continue;
      }
      if (!(field.name in object))
        throw new Error(`Field '${field.name}' doesn't exist on type '${object.__typename}'`);
      const args = Object.fromEntries(
        Object.entries(field.args).map(([key, value]) => [key, evaluate(value, context)]),
      );
      const raw =
        typeof object[field.name] === "function" ? object[field.name](args) : object[field.name];
      result[field.key] = complete(raw, field, context);
    }
    return result;
  }

  function complete(value, field, context) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map((item) => complete(item, field, context));
    if (typeof value === "object") {
      if (!field.children)
        throw new Error(`Field '${field.name}' of type '${value.__typename}' needs selections`);
      return resolveSelections(field.children, value, context);
    }
    if (field.children) throw new Error(`Selections can't be made on scalars ('${field.name}')`);
    return value;
  }

  function pullRequestObject(pull) {
    return {
      __typename: "PullRequest",
      id: `PR_${pull.number}`,
      number: pull.number,
      state: pull.state,
      merged: pull.state === "MERGED",
      isDraft: true,
      isCrossRepository: pull.crossRepository,
      headRefName: pull.branch,
      baseRefName: "main",
      headRepository: {
        __typename: "Repository",
        nameWithOwner: pull.crossRepository ? "fork-owner/invoices" : scenario.repository,
      },
      url: `https://${scenario.host}/${scenario.repository}/pull/${pull.number}`,
      title: pull.branch,
      author: pull.author === null ? null : { __typename: "User", login: pull.author },
      mergeQueueEntry: pull.queued
        ? { __typename: "MergeQueueEntry", id: `MQE_${pull.number}` }
        : null,
      isInMergeQueue: pull.queued,
    };
  }

  function pullRequestConnection(args) {
    if (args.after !== undefined || args.before !== undefined)
      throw new Error("fake gh supports no pagination cursors");
    const limit = args.first ?? args.last;
    if (limit === undefined || limit === null || limit > 100)
      throw new Error("You must provide a `first` or `last` value from 1 to 100");
    const states = args.states === undefined || args.states === null ? null : [args.states].flat();
    const matching = scenario.pulls
      .filter((pull) => args.headRefName === undefined || pull.branch === args.headRefName)
      .filter((pull) => states === null || states.includes(pull.state))
      .sort((left, right) => left.number - right.number);
    if (args.orderBy?.direction === "DESC") matching.reverse();
    const page = args.first === undefined ? matching.slice(-limit) : matching.slice(0, limit);
    return {
      __typename: "PullRequestConnection",
      totalCount: matching.length,
      nodes: page.map(pullRequestObject),
      edges: page.map((pull) => ({
        __typename: "PullRequestEdge",
        cursor: `cursor-${pull.number}`,
        node: pullRequestObject(pull),
      })),
      pageInfo: {
        __typename: "PageInfo",
        hasNextPage: page.length < matching.length,
        hasPreviousPage: false,
        endCursor: page.length > 0 ? `cursor-${page.at(-1).number}` : null,
        startCursor: page.length > 0 ? `cursor-${page[0].number}` : null,
      },
    };
  }

  const repositoryObject = {
    __typename: "Repository",
    nameWithOwner: scenario.repository,
    pullRequests: pullRequestConnection,
    pullRequest: (args) => {
      const pull = scenario.pulls.find((candidate) => candidate.number === args.number);
      if (!pull)
        throw new Error(`Could not resolve to a PullRequest with the number of ${args.number}.`);
      return pullRequestObject(pull);
    },
  };
  const queryRoot = {
    __typename: "Query",
    viewer: { __typename: "User", login: scenario.viewer },
    repository: (args) => {
      if (!sameName(args.owner, owner) || !sameName(args.name, name))
        throw new Error(
          `Could not resolve to a Repository with the name '${args.owner}/${args.name}'.`,
        );
      return repositoryObject;
    },
  };

  if (endpoint === "graphql") {
    if (method !== "POST") reject(`graphql over ${method}`);
    const body =
      input === undefined
        ? {
            query: fields.query,
            variables: Object.fromEntries(
              Object.entries(fields).filter(([key]) => key !== "query"),
            ),
          }
        : JSON.parse(readFileSync(input === "-" ? 0 : input, "utf8"));
    try {
      const document = parseDocument(String(body.query ?? ""));
      const context = { variables: body.variables ?? {}, variableTypes: document.variableTypes };
      const data = resolveSelections(document.selections, queryRoot, context);
      finish(0, `${JSON.stringify({ data })}\n`, "");
    } catch (error) {
      finish(
        1,
        `${JSON.stringify({ errors: [{ message: error.message }] })}\n`,
        `gh: ${error.message}\n`,
      );
    }
  }

  const stacksRead = /^repos\/([^/]+)\/([^/?]+)\/stacks(?:\?(.*))?$/.exec(endpoint);
  if (stacksRead) {
    if (method !== "GET") reject(`unexpected ${method} ${endpoint}`);
    const notFound = () =>
      finish(
        1,
        `${JSON.stringify({ message: "Not Found", documentation_url: "https://docs.github.com/rest", status: "404" })}\n`,
        "gh: Not Found (HTTP 404)\n",
      );
    if (!sameName(stacksRead[1], owner) || !sameName(stacksRead[2], name)) notFound();
    if (scenario.stacksEnabled === false) notFound();
    const number = Number(
      new URLSearchParams(stacksRead[3] ?? "").get("pull_request") ?? fields.pull_request,
    );
    if (!Number.isInteger(number) || number <= 0)
      reject(`stacks read without a pull_request number: ${endpoint}`);
    const entries = scenario.stacks
      .filter((stack) => stack.pulls.includes(number))
      .map((stack) => ({
        id: 9000 + stack.number,
        number: stack.number,
        node_id: `S_${stack.number}`,
        url: `https://${scenario.host}/${scenario.repository}/stacks/${stack.number}`,
        base: { ref: "main" },
        open: true,
        created_at: "2026-10-01T12:00:00Z",
        pull_requests: stack.pulls.map((member) => {
          const pull = scenario.pulls.find((candidate) => candidate.number === member);
          return {
            number: member,
            state: pull.state === "OPEN" ? "open" : "closed",
            draft: true,
            merged_at: pull.state === "MERGED" ? "2026-10-20T12:00:00Z" : null,
            head: { ref: pull.branch, sha: "0000000000000000000000000000000000000000" },
          };
        }),
      }));
    finish(0, `${JSON.stringify(entries)}\n`, "");
  }

  reject(`unexpected endpoint: ${endpoint}`);
}

const DEFAULT_SCENARIO = {
  host: HOST,
  repository: "acme/invoices",
  viewer: "octo",
  repoView: { nameWithOwner: "acme/invoices", url: ORIGIN_URL, defaultBranch: "main" },
  stackView: { exit: 2, stderr: 'current branch "main" is not part of a stack\n' },
  pulls: [],
  stacks: [],
  stacksEnabled: true,
};

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: BASE_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function commit(cwd, file) {
  writeFileSync(join(cwd, file), `${file}\n`);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
  return git(cwd, "rev-parse", "HEAD");
}

// A temporary world: a bare remote with `main`, a clone at <dir>/work whose `origin` is the
// GitHub-style ORIGIN_URL (an insteadOf rule reaches the bare remote), a fake gh and a
// logging git on PATH, and its own HOME and TMPDIR.
function world(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "stacking-prs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!${process.execPath}\n(${fakeGh})(require);\n`);
  chmodSync(join(bin, "gh"), 0o755);
  writeFileSync(join(bin, "git"), GIT_WRAPPER);
  chmodSync(join(bin, "git"), 0o755);
  mkdirSync(join(dir, "home"));
  mkdirSync(join(dir, "tmp"));
  const remote = join(dir, "remote.git");
  git(dir, "init", "-q", "--bare", "-b", "main", remote);
  const work = join(dir, "work");
  git(dir, "init", "-q", "-b", "main", work);
  git(work, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
  git(work, "remote", "add", "origin", ORIGIN_URL);
  commit(work, "base.txt");
  git(work, "push", "-q", "origin", "main");
  const w = {
    dir,
    remote,
    work,
    ghLog: join(dir, "gh.log"),
    gitLog: join(dir, "git.log"),
    scenarioPath: join(dir, "scenario.json"),
    scenario: {},
    env: {
      ...BASE_ENV,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      HOME: join(dir, "home"),
      TMPDIR: join(dir, "tmp"),
      FAKE_GH_LOG: join(dir, "gh.log"),
      FAKE_GIT_LOG: join(dir, "git.log"),
      FAKE_GH_SCENARIO: join(dir, "scenario.json"),
    },
  };
  clearCalls(w);
  setScenario(w, DEFAULT_SCENARIO);
  return w;
}

function setScenario(w, changes) {
  w.scenario = { ...w.scenario, ...changes };
  writeFileSync(w.scenarioPath, JSON.stringify(w.scenario));
}

function clearCalls(w) {
  writeFileSync(w.ghLog, "");
  writeFileSync(w.gitLog, "");
}

function ghCalls(w) {
  return readFileSync(w.ghLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function gitCalls(w) {
  return readFileSync(w.gitLog, "utf8")
    .split("\x1e")
    .filter(Boolean)
    .map((record) => record.split("\x1f").slice(1));
}

function gitSubcommand(argv) {
  return argv.find((arg, index) => !arg.startsWith("-") && !["-C", "-c"].includes(argv[index - 1]));
}

// The distinct D6 environments the fake gh saw.
function childEnvironments(w) {
  return [...new Set(ghCalls(w).map((call) => JSON.stringify(call.env)))].map((text) =>
    JSON.parse(text),
  );
}

function run(w, args, { cwd = w.work, env = {} } = {}) {
  assert.ok(existsSync(SCRIPT), `${SCRIPT} does not exist`);
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { ...w.env, ...env },
    encoding: "utf8",
  });
}

function outputKeys(stdout) {
  return Object.fromEntries(
    stdout
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

// A list key's members, sorted, whether the script separates them with commas or spaces.
function listKey(stdout, key) {
  const value = outputKeys(stdout)[key];
  if (value === undefined) return undefined;
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((item) => item.replace(/^#/, ""))
    .sort();
}

function withoutSeeLine(stderr) {
  return stderr
    .split("\n")
    .filter((line) => !line.startsWith("see "))
    .join("\n");
}

// Every string and number in a JSON record, as strings.
function recordLeaves(path) {
  const leaves = [];
  const visit = (value) => {
    if (value !== null && typeof value === "object") Object.values(value).forEach(visit);
    else leaves.push(String(value));
  };
  visit(JSON.parse(readFileSync(path, "utf8")));
  return leaves;
}

function pull(number, branch, fields = {}) {
  return {
    number,
    branch,
    state: "OPEN",
    author: "octo",
    crossRepository: false,
    queued: false,
    ...fields,
  };
}

function layer(name, { pr, merged = false, queued = false } = {}) {
  const prState = merged ? "MERGED" : queued ? "QUEUED" : "OPEN";
  return {
    name,
    isMerged: merged,
    isQueued: queued,
    needsRebase: false,
    ...(pr === undefined
      ? {}
      : { pr: { number: pr, url: `https://${HOST}/acme/invoices/pull/${pr}`, state: prState } }),
  };
}

// gh stack view --json output for these layers, bottom to top.
function stackView(currentBranch, layers, trunk = "main") {
  return {
    trunk,
    currentBranch,
    branches: layers.map((entry, index) => ({
      base: index === 0 ? trunk : layers[index - 1].name,
      isCurrent: entry.name === currentBranch,
      ...entry,
    })),
  };
}

// invoices/schema, invoices/api, and invoices/ui, each one commit on the one below, from
// main, with invoices/ui checked out.
function buildLayers(w) {
  git(w.work, "switch", "-q", "-c", "invoices/schema", "main");
  const schema = commit(w.work, "schema.txt");
  git(w.work, "switch", "-q", "-c", "invoices/api");
  const api = commit(w.work, "api.txt");
  git(w.work, "switch", "-q", "-c", "invoices/ui");
  const ui = commit(w.work, "ui.txt");
  return { schema, api, ui };
}

// invoices/export, one commit on main, pushed and checked out.
function buildExport(w) {
  git(w.work, "switch", "-q", "-c", "invoices/export", "main");
  const oid = commit(w.work, "export.txt");
  git(w.work, "push", "-q", "origin", "invoices/export");
  return oid;
}

function push(w, ...branches) {
  git(w.work, "push", "-q", "origin", ...branches);
}

function commitOn(w, branch, file) {
  const current = git(w.work, "branch", "--show-current");
  git(w.work, "switch", "-q", branch);
  const oid = commit(w.work, file);
  git(w.work, "switch", "-q", current);
  return oid;
}

function otherClone(w) {
  const clone = mkdtempSync(join(w.dir, "clone-"));
  git(w.dir, "clone", "-q", w.remote, clone);
  return clone;
}

// Pushes one new commit on <branch> from another clone, as a collaborator or CI would.
function advanceRemote(w, branch, file) {
  const clone = otherClone(w);
  git(clone, "switch", "-q", branch);
  const oid = commit(clone, file);
  git(clone, "push", "-q", "origin", branch);
  return oid;
}

// Pushes <branch>, one commit on <base>, from another clone: a PR opened elsewhere.
function pushRemoteOnly(w, branch, base, file) {
  const clone = otherClone(w);
  git(clone, "switch", "-q", "-c", branch, `origin/${base}`);
  const oid = commit(clone, file);
  git(clone, "push", "-q", "origin", branch);
  return oid;
}

// Force-pushes <branch> as one new commit on main, so it shares no commit with the layer.
function replaceRemote(w, branch, file) {
  const clone = otherClone(w);
  git(clone, "switch", "-q", "-C", branch, "origin/main");
  const oid = commit(clone, file);
  git(clone, "push", "-q", "-f", "origin", branch);
  return oid;
}

// Merges invoices/schema into main on the remote, then rebases invoices/api and
// invoices/ui onto the result and force-pushes them, as GitHub does after a stacked merge.
function mergeBottomOnRemote(w) {
  const clone = otherClone(w);
  git(clone, "merge", "-q", "--no-ff", "-m", "Merge invoices/schema", "origin/invoices/schema");
  git(clone, "push", "-q", "origin", "main");
  const oldApi = git(clone, "rev-parse", "origin/invoices/api");
  git(clone, "switch", "-q", "-c", "invoices/api", "origin/invoices/api");
  git(clone, "rebase", "-q", "main");
  git(clone, "push", "-q", "-f", "origin", "invoices/api");
  git(clone, "switch", "-q", "-c", "invoices/ui", "origin/invoices/ui");
  git(clone, "rebase", "-q", "--onto", "invoices/api", oldApi);
  git(clone, "push", "-q", "-f", "origin", "invoices/ui");
}

// Adds a worktree for <branch> at <dir>/<name>, recorded under a path through the symlink
// <dir>/link, so `git worktree list` prints a path that differs as a string from the real one.
function addWorktreeThroughLink(w, name, branch) {
  const link = join(w.dir, "link");
  symlinkSync(w.dir, link);
  git(w.work, "worktree", "add", "-q", join(w.dir, name), branch);
  writeFileSync(join(w.work, ".git", "worktrees", name, "gitdir"), `${join(link, name, ".git")}\n`);
  return join(link, name);
}

function localTip(w, branch) {
  return git(w.work, "rev-parse", `refs/heads/${branch}`);
}

// Runs stack-mode check and returns its record path.
function checkRecord(w) {
  const result = run(w, ["check", "--remote", "origin"]);
  assert.equal(result.status, 0, `check before the change: ${result.stderr}`);
  const record = outputKeys(result.stdout).RECORD;
  assert.ok(record, `check printed no RECORD:\n${result.stdout}`);
  return record;
}

const D6_CHILD_ENV = { GH_FORCE_TTY: "", GH_STACK_NO_ATOMIC: "", GH_REPO: REPO };
const D6_PARENT_ENV = { GH_FORCE_TTY: "1", GH_STACK_NO_ATOMIC: "1", GH_REPO: REPO };

// Slice 1

test("repo picks the one remote that hosts the PRs", async (t) => {
  await t.test("a remote.pushDefault that names a configured remote wins over several", (t) => {
    const w = world(t);
    git(w.work, "remote", "add", "backup", "git@github.acme.invalid:acme/invoices.git");
    git(w.work, "config", "remote.pushDefault", "backup");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).REMOTE, "backup");
  });

  await t.test("a lone remote passes with gh's repository and default branch", (t) => {
    const w = world(t);
    setScenario(w, {
      repoView: { nameWithOwner: "acme/invoices", url: ORIGIN_URL, defaultBranch: "develop" },
    });

    const result = run(w, ["repo"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).REMOTE, "origin");
    assert.equal(outputKeys(result.stdout).REPO, REPO);
    assert.equal(outputKeys(result.stdout).DEFAULT, "develop");
  });

  await t.test("several remotes with no pushDefault exit 7 naming them", (t) => {
    const w = world(t);
    git(w.work, "remote", "add", "backup", "git@github.acme.invalid:acme/invoices.git");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /origin/);
    assert.match(result.stderr, /backup/);
  });

  await t.test("a pushDefault that names no remote exits 7 naming it", (t) => {
    const w = world(t);
    git(w.work, "config", "remote.pushDefault", "gone");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /gone/);
  });

  await t.test("no remote exits 8", (t) => {
    const w = world(t);
    git(w.work, "remote", "remove", "origin");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /No remote is configured/);
  });

  await t.test("a remote name outside the allowlist exits 1 naming it", (t) => {
    const w = world(t);
    git(w.work, "remote", "remove", "origin");
    git(w.work, "config", "remote.ev;il.url", ORIGIN_URL);

    const result = run(w, ["repo"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /ev;il/);
  });
});

test("repo stops unless every source names the remote's repository", async (t) => {
  await t.test("an https URL that differs in case and .git passes", (t) => {
    const w = world(t);
    git(w.work, "remote", "set-url", "origin", "https://github.acme.invalid/Acme/Invoices.git");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).REPO, REPO);
  });

  await t.test("an scp-style SSH URL passes", (t) => {
    const w = world(t);
    git(w.work, "remote", "set-url", "origin", "git@github.acme.invalid:acme/invoices.git");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).REMOTE, "origin");
  });

  await t.test("an ssh:// URL on a host alias passes and REPO takes gh's host", (t) => {
    const w = world(t);
    git(w.work, "remote", "set-url", "origin", "ssh://git@invoices-alias:2222/acme/invoices.git");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).REPO, REPO);
  });

  await t.test("a URL that names no GitHub repository exits 8 naming it", (t) => {
    const w = world(t);
    git(w.work, "remote", "set-url", "origin", "https://github.acme.invalid/invoices");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /https:\/\/github\.acme\.invalid\/invoices/);
    assert.match(result.stderr, /names no GitHub repository/);
  });

  await t.test("a pushurl that names another repository exits 8 naming both", (t) => {
    const w = world(t);
    git(
      w.work,
      "remote",
      "set-url",
      "--push",
      "origin",
      "https://github.acme.invalid/mallory/invoices",
    );

    const result = run(w, ["repo"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /acme\/invoices/);
    assert.match(result.stderr, /mallory\/invoices/);
  });

  await t.test("another remote that names another repository exits 8 naming both", (t) => {
    const w = world(t);
    git(w.work, "remote", "add", "upstream", "https://github.acme.invalid/parent/invoices");
    git(w.work, "config", "remote.pushDefault", "origin");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /acme\/invoices/);
    assert.match(result.stderr, /parent\/invoices/);
  });

  await t.test("a gh-resolved value that names another repository exits 8 naming both", (t) => {
    const w = world(t);
    git(w.work, "config", "remote.origin.gh-resolved", "parent/invoices");

    const result = run(w, ["repo"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /acme\/invoices/);
    assert.match(result.stderr, /parent\/invoices/);
  });

  await t.test("a GH_REPO that names another repository exits 8 naming both", (t) => {
    const w = world(t);

    const result = run(w, ["repo"], {
      env: { GH_REPO: "github.acme.invalid/parent/invoices" },
    });

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /acme\/invoices/);
    assert.match(result.stderr, /parent\/invoices/);
  });

  await t.test("a failing gh repo view exits 1 with gh's stderr before the see line", (t) => {
    const w = world(t);
    setScenario(w, {
      repoView: {
        exit: 1,
        stderr: "HTTP 401: Bad credentials (https://api.github.acme.invalid/graphql)\n",
      },
    });

    const result = run(w, ["repo"]);

    assert.equal(result.status, 1, result.stderr);
    const lines = result.stderr.replace(/\n$/, "").split("\n");
    const ghLine = lines.findIndex((line) => line.includes("HTTP 401: Bad credentials"));
    assert.notEqual(ghLine, -1, `gh's stderr is missing:\n${result.stderr}`);
    assert.match(lines.at(-1), /^see /, `the see line is not last:\n${result.stderr}`);
    assert.ok(
      ghLine < lines.length - 1,
      `gh's stderr is not before the see line:\n${result.stderr}`,
    );
  });

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const w = world(t);

    const result = run(w, ["repo"], { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });
});

// Slice 3

test("check stack mode passes only layers the user owns and can publish", async (t) => {
  await t.test("every layer absent passes and each is listed in NO_PR", (t) => {
    const w = world(t);
    buildLayers(w);
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema"),
        layer("invoices/api"),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "NO_PR"), [
      "invoices/api",
      "invoices/schema",
      "invoices/ui",
    ]);
  });

  await t.test("equal tips after a partial submit pass", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    setScenario(w, {
      pulls: [pull(102, "invoices/api"), pull(103, "invoices/ui")],
      stacks: [{ number: 7, pulls: [102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema"),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "NO_PR"), ["invoices/schema"]);
  });

  await t.test("a merged layer skips the remote-tip test", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    replaceRemote(w, "invoices/schema", "schema-elsewhere.txt");
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema", { state: "MERGED" }),
        pull(102, "invoices/api"),
        pull(103, "invoices/ui"),
      ],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
  });

  await t.test("the record holds every field the script rules list", (t) => {
    const w = world(t);
    const tips = buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    const csvTip = pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema", { state: "MERGED" }),
        pull(102, "invoices/api"),
        pull(104, "invoices/csv"),
      ],
      stacks: [{ number: 7, pulls: [101, 102, 104] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    const record = outputKeys(result.stdout).RECORD;
    assert.equal(dirname(dirname(realpathSync(record))), join(w.dir, "tmp"));
    const leaves = recordLeaves(record);
    const expected = ["origin", "main", tips.api, "absent", csvTip, tips.schema, "102", "104"];
    assert.deepEqual(
      expected.filter((value) => !leaves.includes(value)),
      [],
      `the record lacks these values: ${JSON.stringify(leaves)}`,
    );
    assert.ok(
      leaves.some((value) => /acme\/invoices/i.test(value)),
      "the record names no repository",
    );
    assert.ok(
      leaves.some((value) => /^open$/i.test(value)),
      "the record holds no PR state",
    );
  });

  await t.test("a bad --remote name exits 1 before any git call", (t) => {
    const w = world(t);

    const result = run(w, ["check", "--remote", "or;gin"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /or;gin/);
    assert.deepEqual(gitCalls(w), []);
  });

  await t.test("a missing <remote>/<trunk> exits 1 naming the trunk", (t) => {
    const w = world(t);
    buildLayers(w);
    setScenario(w, {
      stackView: stackView(
        "invoices/ui",
        [layer("invoices/schema"), layer("invoices/api"), layer("invoices/ui")],
        "release/2026",
      ),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /release\/2026/);
  });

  await t.test("a full query page exits 1 naming the branch", (t) => {
    const w = world(t);
    buildLayers(w);
    setScenario(w, {
      pulls: Array.from({ length: 101 }, (_, index) =>
        pull(index + 1, "invoices/schema", { state: "MERGED" }),
      ),
      stackView: stackView("invoices/ui", [
        layer("invoices/schema"),
        layer("invoices/api"),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/schema/);
  });

  await t.test("a view --json that disagrees with GitHub on a merge exits 1", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api", { state: "MERGED" })],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/api|#?102\b/);
  });

  await t.test("a Stacks REST API 404 exits 1 saying stacked PRs are off", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema");
    setScenario(w, {
      stacksEnabled: false,
      pulls: [pull(101, "invoices/schema")],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api"),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 1, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /stacked (PRs|pull requests)/i);
  });

  await t.test("a --remote that names no remote exits 2", (t) => {
    const w = world(t);

    const result = run(w, ["check", "--remote", "upstream"]);

    assert.equal(result.status, 2, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /upstream/);
  });

  await t.test("another author's PR exits 3 naming the PR and author", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api", { author: "mallory" })],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#102\b/);
    assert.match(result.stderr, /mallory/);
  });

  await t.test("another author's GitHub-only PR exits 3 naming the PR and author", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema"),
        pull(102, "invoices/api"),
        pull(104, "invoices/csv", { author: "mallory" }),
      ],
      stacks: [{ number: 7, pulls: [101, 102, 104] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#104\b/);
    assert.match(result.stderr, /mallory/);
  });

  await t.test("a PR with a null author exits 3 naming the PR", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api", { author: null })],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#102\b/);
  });

  await t.test("a closed PR that view --json dropped, with no stack ID, exits 3", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api", { state: "CLOSED" })],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api"),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#102\b/);
    assert.match(result.stderr, /closed/i);
  });

  await t.test("a closed PR that view --json shows open, with a stack ID, exits 3", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema"),
        pull(102, "invoices/api", { state: "CLOSED" }),
        pull(103, "invoices/ui"),
      ],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#102\b/);
    assert.match(result.stderr, /closed/i);
  });

  await t.test("a queued PR that view --json shows unqueued exits 3", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema", { queued: true }), pull(102, "invoices/api")],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#101\b/);
    assert.match(result.stderr, /merge queue/i);
  });

  await t.test("two open PRs on one branch exit 3 naming both", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api"), pull(105, "invoices/api")],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#102\b/);
    assert.match(result.stderr, /#105\b/);
  });

  await t.test("a layer with a remote-only commit exits 4 naming the layer", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    commitOn(w, "invoices/api", "api-local.txt");
    advanceRemote(w, "invoices/api", "api-remote.txt");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api"), pull(103, "invoices/ui")],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
  });

  await t.test("another remote naming another repository exits 8 naming both", (t) => {
    const w = world(t);
    buildLayers(w);
    git(w.work, "remote", "add", "upstream", "https://github.acme.invalid/parent/invoices");
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema"),
        layer("invoices/api"),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 8, result.stderr);
    assert.match(result.stderr, /acme\/invoices/);
    assert.match(result.stderr, /parent\/invoices/);
  });

  await t.test("a same-name cross-repository PR is ignored", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema"),
        pull(102, "invoices/api"),
        pull(150, "invoices/api", { author: "mallory", crossRepository: true }),
      ],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
  });

  await t.test("an untracked merged PR on a reused branch name counts as none", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [
        pull(90, "invoices/ui", { state: "MERGED" }),
        pull(101, "invoices/schema"),
        pull(102, "invoices/api"),
      ],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "NO_PR"), ["invoices/ui"]);
  });

  await t.test("the stack read uses the lowest active layer with an open PR", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [pull(102, "invoices/api"), pull(103, "invoices/ui"), pull(104, "invoices/csv")],
      // A refused stack update left #103 out of GitHub's stack.
      stacks: [{ number: 7, pulls: [102, 104] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema"),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "REMOTE_ONLY"), ["104"]);
  });

  await t.test("with no open active PR, the top merged layer's PR picks the stack", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [
        pull(100, "invoices/prep", { state: "MERGED" }),
        pull(101, "invoices/schema", { state: "MERGED" }),
        pull(102, "invoices/api", { state: "MERGED" }),
        pull(104, "invoices/csv"),
      ],
      stacks: [
        { number: 5, pulls: [100, 101] },
        { number: 7, pulls: [102, 104] },
      ],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102, merged: true }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "REMOTE_ONLY"), ["104"]);
  });

  await t.test("REMOTE_ONLY names only the user's open GitHub-only PRs", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [
        pull(100, "invoices/prep", { state: "MERGED" }),
        pull(101, "invoices/schema"),
        pull(102, "invoices/api"),
        pull(104, "invoices/csv"),
      ],
      stacks: [{ number: 7, pulls: [100, 101, 102, 104] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "REMOTE_ONLY"), ["104"]);
  });

  await t.test(
    "one run makes one fetch, view --json, layer read, stack read, and head.ref query",
    (t) => {
      const w = world(t);
      buildLayers(w);
      push(w, "invoices/schema", "invoices/api");
      pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
      setScenario(w, {
        pulls: [
          pull(100, "invoices/prep", { state: "MERGED" }),
          pull(101, "invoices/schema"),
          pull(102, "invoices/api"),
          pull(104, "invoices/csv"),
        ],
        stacks: [{ number: 7, pulls: [100, 101, 102, 104] }],
        stackView: stackView("invoices/ui", [
          layer("invoices/schema", { pr: 101 }),
          layer("invoices/api", { pr: 102 }),
          layer("invoices/ui"),
        ]),
      });

      const result = run(w, ["check", "--remote", "origin"]);

      assert.equal(result.status, 0, result.stderr);
      const gh = ghCalls(w).map((call) => call.argv);
      assert.deepEqual(
        {
          fetch: gitCalls(w).filter((argv) => gitSubcommand(argv) === "fetch").length,
          viewJson: gh.filter((argv) => argv[0] === "stack" && argv[1] === "view").length,
          graphql: gh.filter((argv) => argv[0] === "api" && argv.includes("graphql")).length,
          stackRead: gh.filter(
            (argv) => argv[0] === "api" && argv.some((arg) => /\/stacks\b/.test(arg)),
          ).length,
        },
        { fetch: 1, viewJson: 1, graphql: 2, stackRead: 1 },
      );
    },
  );

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api"), pull(103, "invoices/ui")],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"], { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });
});

// The base for most compare rows: invoices/schema #101 and invoices/api #102 pushed and
// open, invoices/ui not pushed with no PR, and GitHub stack #7 holding #101 and #102.
const COMPARE_PULLS = [pull(101, "invoices/schema"), pull(102, "invoices/api")];
const COMPARE_VIEW = stackView("invoices/ui", [
  layer("invoices/schema", { pr: 101 }),
  layer("invoices/api", { pr: 102 }),
  layer("invoices/ui"),
]);

function compareWorld(t) {
  const w = world(t);
  buildLayers(w);
  push(w, "invoices/schema", "invoices/api");
  setScenario(w, {
    pulls: COMPARE_PULLS,
    stacks: [{ number: 7, pulls: [101, 102] }],
    stackView: COMPARE_VIEW,
  });
  return w;
}

test("compare stops when any recorded tip, PR, or stack changed", async (t) => {
  await t.test("passes when nothing moved, absent tips included", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  await t.test("a moved tip exits 5 and lists the new commits", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    advanceRemote(w, "invoices/api", "api-fix.txt");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
    assert.match(result.stderr, /api-fix\.txt/);
  });

  await t.test("an absent branch now on the remote exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    push(w, "invoices/ui");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/ui/);
  });

  await t.test("a PR number that changed exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    setScenario(w, {
      pulls: [...COMPARE_PULLS, pull(103, "invoices/ui")],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/ui|#?103\b/);
  });

  await t.test("a PR state that changed exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api", { state: "CLOSED" })],
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/api|#?102\b/);
  });

  await t.test("a moved local tip of a merged layer exits 5", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema", { state: "MERGED" }), pull(102, "invoices/api")],
      stacks: [{ number: 7, pulls: [101, 102] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });
    const record = checkRecord(w);
    commitOn(w, "invoices/schema", "schema-late.txt");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/schema/);
  });

  await t.test("a changed GitHub stack PR set exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    setScenario(w, {
      pulls: [...COMPARE_PULLS, pull(104, "invoices/csv")],
      stacks: [{ number: 7, pulls: [101, 102, 104] }],
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /#?104\b/);
  });

  await t.test("an unrecorded layer with a remote branch exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    git(w.work, "branch", "invoices/docs", "invoices/ui");
    pushRemoteOnly(w, "invoices/docs", "main", "docs.txt");
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
        layer("invoices/docs"),
      ]),
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/docs/);
  });

  await t.test("an unrecorded layer with a PR exits 5", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    git(w.work, "branch", "invoices/docs", "invoices/ui");
    setScenario(w, {
      pulls: [...COMPARE_PULLS, pull(106, "invoices/docs")],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
        layer("invoices/docs", { pr: 106 }),
      ]),
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/docs|#?106\b/);
  });

  await t.test("a record path that does not exist exits 2", (t) => {
    const w = compareWorld(t);

    const result = run(w, ["compare", join(w.dir, "missing-record.json")]);

    assert.equal(result.status, 2, result.stderr);
  });

  await t.test("a record that is not JSON exits 2", (t) => {
    const w = compareWorld(t);
    writeFileSync(join(w.dir, "broken-record.json"), "not json\n");

    const result = run(w, ["compare", join(w.dir, "broken-record.json")]);

    assert.equal(result.status, 2, result.stderr);
  });

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    clearCalls(w);

    const result = run(w, ["compare", record], { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });

  // Slice 6 rows.

  await t.test("passes after sync pulled a REMOTE_ONLY branch", (t) => {
    const w = compareWorld(t);
    pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [...COMPARE_PULLS, pull(104, "invoices/csv")],
      stacks: [{ number: 7, pulls: [101, 102, 104] }],
    });
    const record = checkRecord(w);
    git(w.work, "fetch", "-q", "origin");
    git(w.work, "branch", "invoices/csv", "origin/invoices/csv");
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
        layer("invoices/csv", { pr: 104 }),
      ]),
    });

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 0, result.stderr);
  });

  await t.test("a pulled REMOTE_ONLY branch whose tip moved exits 5", (t) => {
    const w = compareWorld(t);
    pushRemoteOnly(w, "invoices/csv", "invoices/api", "csv.txt");
    setScenario(w, {
      pulls: [...COMPARE_PULLS, pull(104, "invoices/csv")],
      stacks: [{ number: 7, pulls: [101, 102, 104] }],
    });
    const record = checkRecord(w);
    git(w.work, "fetch", "-q", "origin");
    git(w.work, "branch", "invoices/csv", "origin/invoices/csv");
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
        layer("invoices/csv", { pr: 104 }),
      ]),
    });
    advanceRemote(w, "invoices/csv", "csv-fix.txt");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/csv/);
  });

  await t.test("a merged layer whose local branch is gone exits 5", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema", { state: "MERGED" }), pull(102, "invoices/api")],
      stacks: [{ number: 7, pulls: [101, 102] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });
    const record = checkRecord(w);
    git(w.work, "branch", "-q", "-D", "invoices/schema");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/schema/);
  });
});

// The state after a submit for most after-submit rows: invoices/schema #101 merged, and
// invoices/api #102 and invoices/ui #103 open.
const SUBMITTED_PULLS = [
  pull(101, "invoices/schema", { state: "MERGED" }),
  pull(102, "invoices/api"),
  pull(103, "invoices/ui"),
];
const SUBMITTED_VIEW = stackView("invoices/ui", [
  layer("invoices/schema", { pr: 101, merged: true }),
  layer("invoices/api", { pr: 102 }),
  layer("invoices/ui", { pr: 103 }),
]);

// Records the stack before submit: invoices/schema #101 merged, invoices/api and
// invoices/ui not pushed, then pushes them as submit does.
function recordBeforeSubmit(t) {
  const w = world(t);
  buildLayers(w);
  push(w, "invoices/schema");
  setScenario(w, {
    pulls: [pull(101, "invoices/schema", { state: "MERGED" })],
    stackView: stackView("invoices/ui", [
      layer("invoices/schema", { pr: 101, merged: true }),
      layer("invoices/api"),
      layer("invoices/ui"),
    ]),
  });
  const record = checkRecord(w);
  push(w, "invoices/api", "invoices/ui");
  return { w, record };
}

test("after-submit stops when GitHub's stack differs from the local stack", async (t) => {
  await t.test("prints STACK when the unmerged PRs match bottom to top, merged ignored", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: SUBMITTED_PULLS,
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: SUBMITTED_VIEW,
    });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputKeys(result.stdout).STACK, "7");
  });

  await t.test("an active layer with no open PR exits 6 naming it", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: [pull(101, "invoices/schema", { state: "MERGED" }), pull(102, "invoices/api")],
      stacks: [{ number: 7, pulls: [101, 102] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui"),
      ]),
    });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 6, result.stderr);
    assert.match(result.stderr, /invoices\/ui/);
  });

  await t.test("a top PR in no stack exits 9", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, { pulls: SUBMITTED_PULLS, stacks: [], stackView: SUBMITTED_VIEW });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 9, result.stderr);
  });

  await t.test("a stack that lacks a PR exits 9", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: SUBMITTED_PULLS,
      stacks: [{ number: 7, pulls: [101, 103] }],
      stackView: SUBMITTED_VIEW,
    });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 9, result.stderr);
  });

  await t.test("a stack that adds a PR exits 9", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: [...SUBMITTED_PULLS, pull(104, "invoices/csv")],
      stacks: [{ number: 7, pulls: [101, 102, 103, 104] }],
      stackView: SUBMITTED_VIEW,
    });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 9, result.stderr);
  });

  await t.test("a stack that reorders PRs exits 9", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: SUBMITTED_PULLS,
      stacks: [{ number: 7, pulls: [101, 103, 102] }],
      stackView: SUBMITTED_VIEW,
    });

    const result = run(w, ["after-submit", record]);

    assert.equal(result.status, 9, result.stderr);
  });

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const { w, record } = recordBeforeSubmit(t);
    setScenario(w, {
      pulls: SUBMITTED_PULLS,
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: SUBMITTED_VIEW,
    });
    clearCalls(w);

    const result = run(w, ["after-submit", record], { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });
});

// Slice 4

// invoices/export #120, pushed and checked out, in no GitHub stack.
function exportWorld(t) {
  const w = world(t);
  buildExport(w);
  setScenario(w, { pulls: [pull(120, "invoices/export")] });
  return w;
}

const NAMED_EXPORT = ["check", "--remote", "origin", "--trunk", "main", "invoices/export"];

test("named-mode check vets the branch to split", async (t) => {
  await t.test("passes with empty STACKED when the branch's PR is in no GitHub stack", (t) => {
    const w = exportWorld(t);

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "STACKED"), []);
  });

  await t.test("STACKED names a branch whose open PR is in a GitHub stack", (t) => {
    const w = exportWorld(t);
    setScenario(w, {
      pulls: [pull(120, "invoices/export"), pull(121, "invoices/export-ui")],
      stacks: [{ number: 9, pulls: [120, 121] }],
    });

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "STACKED"), ["invoices/export"]);
  });

  await t.test("a same-name cross-repository PR is ignored", (t) => {
    const w = exportWorld(t);
    setScenario(w, {
      pulls: [
        pull(120, "invoices/export"),
        pull(150, "invoices/export", { author: "mallory", crossRepository: true }),
      ],
    });

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
  });

  await t.test("a closed PR exits 3", (t) => {
    const w = exportWorld(t);
    setScenario(w, { pulls: [pull(120, "invoices/export", { state: "CLOSED" })] });

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#120\b/);
    assert.match(result.stderr, /closed/i);
  });

  await t.test("a queued PR exits 3", (t) => {
    const w = exportWorld(t);
    setScenario(w, { pulls: [pull(120, "invoices/export", { queued: true })] });

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /#120\b/);
    assert.match(result.stderr, /merge queue/i);
  });

  await t.test("a named branch missing locally exits 2 naming it", (t) => {
    const w = exportWorld(t);

    const result = run(w, ["check", "--remote", "origin", "--trunk", "main", "invoices/missing"]);

    assert.equal(result.status, 2, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /invoices\/missing/);
  });

  await t.test("a missing <remote>/<trunk> exits 2 naming the trunk", (t) => {
    const w = exportWorld(t);

    const result = run(w, [
      "check",
      "--remote",
      "origin",
      "--trunk",
      "release/2026",
      "invoices/export",
    ]);

    assert.equal(result.status, 2, result.stderr);
    assert.match(withoutSeeLine(result.stderr), /release\/2026/);
  });

  await t.test("makes no gh stack call", (t) => {
    const w = exportWorld(t);

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      ghCalls(w).filter((call) => call.argv[0] === "stack"),
      [],
    );
  });

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const w = exportWorld(t);

    const result = run(w, NAMED_EXPORT, { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });
});

// The three layers pushed with open PRs #101 to #103 in GitHub stack #7.
function pushedStackWorld(t) {
  const w = world(t);
  const tips = buildLayers(w);
  push(w, "invoices/schema", "invoices/api", "invoices/ui");
  setScenario(w, {
    pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api"), pull(103, "invoices/ui")],
    stacks: [{ number: 7, pulls: [101, 102, 103] }],
    stackView: stackView("invoices/ui", [
      layer("invoices/schema", { pr: 101 }),
      layer("invoices/api", { pr: 102 }),
      layer("invoices/ui", { pr: 103 }),
    ]),
  });
  return { w, tips };
}

test("check fast-forwards a behind layer unless another worktree holds it", async (t) => {
  await t.test("stack mode: a behind current branch moves with its worktree", (t) => {
    const { w } = pushedStackWorld(t);
    const remoteFix = advanceRemote(w, "invoices/ui", "ui-fix.txt");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "FORWARDED"), ["invoices/ui"]);
    assert.equal(localTip(w, "invoices/ui"), remoteFix);
    assert.equal(git(w.work, "status", "--porcelain"), "");
  });

  await t.test("stack mode: a behind branch that is not current moves", (t) => {
    const { w } = pushedStackWorld(t);
    const remoteFix = advanceRemote(w, "invoices/api", "api-fix.txt");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "FORWARDED"), ["invoices/api"]);
    assert.equal(localTip(w, "invoices/api"), remoteFix);
    assert.equal(git(w.work, "branch", "--show-current"), "invoices/ui");
  });

  await t.test("named mode: a behind current branch moves with its worktree", (t) => {
    const w = exportWorld(t);
    const remoteFix = advanceRemote(w, "invoices/export", "export-fix.txt");

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "FORWARDED"), ["invoices/export"]);
    assert.equal(localTip(w, "invoices/export"), remoteFix);
    assert.equal(git(w.work, "status", "--porcelain"), "");
  });

  await t.test("named mode: a behind branch that is not current moves", (t) => {
    const w = exportWorld(t);
    git(w.work, "switch", "-q", "main");
    const remoteFix = advanceRemote(w, "invoices/export", "export-fix.txt");

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "FORWARDED"), ["invoices/export"]);
    assert.equal(localTip(w, "invoices/export"), remoteFix);
  });

  await t.test("stack mode: another worktree holding a behind layer exits 3, no ref moved", (t) => {
    const { w, tips } = pushedStackWorld(t);
    const otherTree = join(w.dir, "other-tree");
    git(w.work, "worktree", "add", "-q", otherTree, "invoices/api");
    advanceRemote(w, "invoices/api", "api-fix.txt");
    advanceRemote(w, "invoices/ui", "ui-fix.txt");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
    assert.ok(
      result.stderr.includes(otherTree),
      `stderr does not name ${otherTree}:\n${result.stderr}`,
    );
    assert.deepEqual(
      [localTip(w, "invoices/api"), localTip(w, "invoices/ui")],
      [tips.api, tips.ui],
    );
  });

  await t.test(
    "named mode: another worktree holding a behind branch exits 3, no ref moved",
    (t) => {
      const w = exportWorld(t);
      const exportTip = localTip(w, "invoices/export");
      git(w.work, "switch", "-q", "main");
      const otherTree = join(w.dir, "other-tree");
      git(w.work, "worktree", "add", "-q", otherTree, "invoices/export");
      advanceRemote(w, "invoices/export", "export-fix.txt");

      const result = run(w, NAMED_EXPORT);

      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stderr, /invoices\/export/);
      assert.ok(
        result.stderr.includes(otherTree),
        `stderr does not name ${otherTree}:\n${result.stderr}`,
      );
      assert.equal(localTip(w, "invoices/export"), exportTip);
    },
  );

  await t.test("stack mode: another worktree recorded through a symlink exits 3", (t) => {
    const { w, tips } = pushedStackWorld(t);
    addWorktreeThroughLink(w, "other-tree", "invoices/api");
    advanceRemote(w, "invoices/api", "api-fix.txt");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
    assert.equal(localTip(w, "invoices/api"), tips.api);
  });

  await t.test("stack mode: the current worktree reached through a symlink passes", (t) => {
    const { w } = pushedStackWorld(t);
    git(w.work, "switch", "-q", "main");
    const linkedTree = addWorktreeThroughLink(w, "second", "invoices/ui");

    const result = run(w, ["check", "--remote", "origin"], { cwd: linkedTree });

    assert.equal(result.status, 0, result.stderr);
  });
});

// Slice 5

test("check passes a rebased layer only when every remote commit has a local copy", async (t) => {
  await t.test("stack mode: layers GitHub rebased after a merge pass in DIVERGED", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    mergeBottomOnRemote(w);
    setScenario(w, {
      pulls: [
        pull(101, "invoices/schema", { state: "MERGED" }),
        pull(102, "invoices/api"),
        pull(103, "invoices/ui"),
      ],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101, merged: true }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(listKey(result.stdout, "DIVERGED"), ["invoices/api", "invoices/ui"]);
  });

  await t.test(
    "stack mode: layers rebased locally over their old remote copies pass in DIVERGED",
    (t) => {
      const { w } = pushedStackWorld(t);
      commitOn(w, "invoices/schema", "schema-fix.txt");
      git(w.work, "switch", "-q", "invoices/api");
      git(w.work, "rebase", "-q", "invoices/schema");
      git(w.work, "switch", "-q", "invoices/ui");
      git(w.work, "rebase", "-q", "invoices/api");

      const result = run(w, ["check", "--remote", "origin"]);

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(listKey(result.stdout, "DIVERGED"), ["invoices/api", "invoices/ui"]);
    },
  );

  await t.test("stack mode: a remote commit with no local copy exits 4 naming it", (t) => {
    const { w } = pushedStackWorld(t);
    commitOn(w, "invoices/api", "api-local.txt");
    const remoteOnly = advanceRemote(w, "invoices/api", "api-remote.txt");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
    assert.ok(
      result.stderr.includes(remoteOnly.slice(0, 7)),
      `stderr does not name ${remoteOnly}:\n${result.stderr}`,
    );
  });

  await t.test(
    "named mode: a branch rebased locally over its old remote copy passes in DIVERGED",
    (t) => {
      const w = exportWorld(t);
      advanceRemote(w, "main", "main-next.txt");
      git(w.work, "fetch", "-q", "origin");
      git(w.work, "rebase", "-q", "origin/main");

      const result = run(w, NAMED_EXPORT);

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(listKey(result.stdout, "DIVERGED"), ["invoices/export"]);
    },
  );

  await t.test("named mode: a remote commit with no local copy exits 4 naming it", (t) => {
    const w = exportWorld(t);
    commit(w.work, "export-local.txt");
    const remoteOnly = advanceRemote(w, "invoices/export", "export-remote.txt");

    const result = run(w, NAMED_EXPORT);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stderr, /invoices\/export/);
    assert.ok(
      result.stderr.includes(remoteOnly.slice(0, 7)),
      `stderr does not name ${remoteOnly}:\n${result.stderr}`,
    );
  });
});

// Slice 6

// The three layers pushed with PRs #101 to #103, and #104 on invoices/csv, the user's PR
// from another clone, on top of them in GitHub stack #7.
function remoteOnlyWorld(t) {
  const { w } = pushedStackWorld(t);
  pushRemoteOnly(w, "invoices/csv", "invoices/ui", "csv.txt");
  setScenario(w, {
    pulls: [
      pull(101, "invoices/schema"),
      pull(102, "invoices/api"),
      pull(103, "invoices/ui"),
      pull(104, "invoices/csv"),
    ],
    stacks: [{ number: 7, pulls: [101, 102, 103, 104] }],
  });
  return w;
}

test("after-sync stops when sync skipped a pull or left a tip unpushed", async (t) => {
  await t.test("passes when each REMOTE_ONLY branch is a layer and every tip matches", (t) => {
    const w = remoteOnlyWorld(t);
    const record = checkRecord(w);
    git(w.work, "fetch", "-q", "origin");
    git(w.work, "branch", "invoices/csv", "origin/invoices/csv");
    setScenario(w, {
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
        layer("invoices/csv", { pr: 104 }),
      ]),
    });

    const result = run(w, ["after-sync", record]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  await t.test("a REMOTE_ONLY branch that is not a layer exits 9 with every tip matching", (t) => {
    const w = remoteOnlyWorld(t);
    const record = checkRecord(w);

    const result = run(w, ["after-sync", record]);

    assert.equal(result.status, 9, result.stderr);
    assert.match(result.stderr, /#104\b/);
  });

  await t.test("an active layer whose local and remote tips differ exits 6 naming it", (t) => {
    const { w } = pushedStackWorld(t);
    const record = checkRecord(w);
    commit(w.work, "ui-unpushed.txt");

    const result = run(w, ["after-sync", record]);

    assert.equal(result.status, 6, result.stderr);
    assert.match(result.stderr, /invoices\/ui/);
  });

  await t.test("gh runs without GH_FORCE_TTY or GH_STACK_NO_ATOMIC and with GH_REPO", (t) => {
    const { w } = pushedStackWorld(t);
    const record = checkRecord(w);
    clearCalls(w);

    const result = run(w, ["after-sync", record], { env: D6_PARENT_ENV });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(childEnvironments(w), [D6_CHILD_ENV]);
  });
});

// A --single-branch clone's fetch refspec maps only the trunk.
const TRUNK_ONLY_REFSPEC = "+refs/heads/main:refs/remotes/origin/main";

test("a single-branch clone still sees every layer's remote tip", async (t) => {
  await t.test("check exits 4 on a layer with remote-only commits", (t) => {
    const w = world(t);
    buildLayers(w);
    push(w, "invoices/schema", "invoices/api", "invoices/ui");
    git(w.work, "config", "remote.origin.fetch", TRUNK_ONLY_REFSPEC);
    commitOn(w, "invoices/api", "api-local.txt");
    advanceRemote(w, "invoices/api", "api-remote.txt");
    setScenario(w, {
      pulls: [pull(101, "invoices/schema"), pull(102, "invoices/api"), pull(103, "invoices/ui")],
      stacks: [{ number: 7, pulls: [101, 102, 103] }],
      stackView: stackView("invoices/ui", [
        layer("invoices/schema", { pr: 101 }),
        layer("invoices/api", { pr: 102 }),
        layer("invoices/ui", { pr: 103 }),
      ]),
    });

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
  });

  await t.test("compare exits 5 on a layer whose remote tip moved", (t) => {
    const w = compareWorld(t);
    git(w.work, "config", "remote.origin.fetch", TRUNK_ONLY_REFSPEC);
    const record = checkRecord(w);
    advanceRemote(w, "invoices/api", "api-fix.txt");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
  });

  await t.test("after-sync exits 6 on a layer whose remote tip moved", (t) => {
    const w = compareWorld(t);
    git(w.work, "config", "remote.origin.fetch", TRUNK_ONLY_REFSPEC);
    const record = checkRecord(w);
    advanceRemote(w, "invoices/api", "api-fix.txt");

    const result = run(w, ["after-sync", record]);

    assert.equal(result.status, 6, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
  });
});

// Review round 3

// Deletes <branch> on the bare remote, as GitHub does after a merge, and leaves the clone's
// refs/remotes/origin/<branch> in place.
function deleteRemoteBranch(w, branch) {
  git(w.remote, "update-ref", "-d", `refs/heads/${branch}`);
}

test("a remote branch deleted behind a stale tracking ref counts as absent", async (t) => {
  await t.test("check records a deleted layer branch as absent, not as diverged", (t) => {
    const { w } = pushedStackWorld(t);
    advanceRemote(w, "invoices/api", "api-remote.txt");
    git(w.work, "fetch", "-q", "origin");
    commitOn(w, "invoices/api", "api-local.txt");
    deleteRemoteBranch(w, "invoices/api");

    const result = run(w, ["check", "--remote", "origin"]);

    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(outputKeys(result.stdout).RECORD, "utf8"));
    const api = record.layers.find((entry) => entry.branch === "invoices/api");
    assert.equal(api.remoteTip, "absent");
  });

  await t.test("compare exits 5 when a recorded layer branch was deleted", (t) => {
    const w = compareWorld(t);
    const record = checkRecord(w);
    deleteRemoteBranch(w, "invoices/api");

    const result = run(w, ["compare", record]);

    assert.equal(result.status, 5, result.stderr);
    assert.match(result.stderr, /invoices\/api/);
  });

  await t.test("after-sync exits 6 when an active layer's branch was deleted", (t) => {
    const { w } = pushedStackWorld(t);
    const record = checkRecord(w);
    deleteRemoteBranch(w, "invoices/ui");

    const result = run(w, ["after-sync", record]);

    assert.equal(result.status, 6, result.stderr);
    assert.match(result.stderr, /invoices\/ui/);
  });
});
