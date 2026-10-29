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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
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

function withoutSeeLine(stderr) {
  return stderr
    .split("\n")
    .filter((line) => !line.startsWith("see "))
    .join("\n");
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
