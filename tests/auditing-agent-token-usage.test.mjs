// Fails when audit-token-usage.sh accepts a window that is not a positive integer, reads session
// files written outside the window, stops naming a missing jq, counts a pinned agent definition
// as an inherited model, counts MCP servers from anything but tool calls, moves the oversized
// tool-result cutoff off 10,000 characters, or sums Codex usage other than per-response records.
// Every case runs the real script against a synthetic HOME in a temporary directory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve(
  "skills/engineering/auditing-agent-token-usage/scripts/audit-token-usage.sh",
);
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const DAY_SECONDS = 24 * 60 * 60;

function fakeHome(t) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "auditing-agent-token-usage-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

function write(home, path, text) {
  const file = join(home, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function jsonl(home, path, records) {
  return write(home, path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

function run(home, args = [], path = process.env.PATH) {
  return spawnSync(BASH, [SCRIPT, ...args], { encoding: "utf8", env: { HOME: home, PATH: path } });
}

// The text of report section `[n]`, from its heading to the next one.
function section(stdout, n) {
  const found = stdout.split(/^--- /m).find((part) => part.startsWith(`[${n}]`));
  assert.ok(found, `no section [${n}] in:\n${stdout}`);
  return found;
}

function assistant(content, extra = {}) {
  return { type: "assistant", message: { model: "model-a", content }, ...extra };
}

function toolUse(name, input = {}) {
  return { type: "tool_use", name, input };
}

test("a window that is not one positive integer exits 64 with a usage line", (t) => {
  const home = fakeHome(t);
  for (const args of [["0"], ["-3"], ["seven"], ["1.5"], ["7", "extra"]]) {
    const result = run(home, args);
    assert.equal(result.status, 64, args.join(" "));
    assert.match(result.stderr, /^usage: audit-token-usage\.sh \[days\]/);
    assert.equal(result.stdout, "");
  }
});

test("a missing jq exits 1 naming it", (t) => {
  const home = fakeHome(t);
  const result = run(home, ["7"], join(home, "empty-bin"));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "missing: jq\n");
});

test("no session file written in the window prints one line and exits 0", (t) => {
  const home = fakeHome(t);
  const stale = jsonl(home, ".claude/projects/proj/old.jsonl", [assistant([])]);
  const thirtyDaysAgo = Date.now() / 1000 - 30 * DAY_SECONDS;
  utimesSync(stale, thirtyDaysAgo, thirtyDaysAgo);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "no session transcripts modified in the last 7 days\n");
});

test("an Agent spawn is INHERITED without model:, DEFINITION when its definition pins one", (t) => {
  const home = fakeHome(t);
  write(
    home,
    ".claude/agents/pinned-agent.md",
    "---\nname: pinned-agent\nmodel: haiku\n---\n\nBody.\n",
  );
  write(home, ".claude/agents/loose-agent.md", "---\nname: loose-agent\n---\n\nBody.\n");
  jsonl(home, ".claude/projects/proj/session.jsonl", [
    assistant([toolUse("Agent", { subagent_type: "general-purpose" })]),
    assistant([toolUse("Agent", { subagent_type: "some-plugin:pinned-agent" })]),
    assistant([toolUse("Agent", { subagent_type: "loose-agent" })]),
    assistant([toolUse("Agent", { subagent_type: "general-purpose", model: "sonnet" })]),
  ]);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  const spawns = section(result.stdout, 2);
  assert.match(spawns, /^\s+1\s+INHERITED\s+general-purpose$/m);
  assert.match(spawns, /^\s+1\s+DEFINITION\s+some-plugin:pinned-agent$/m);
  assert.match(spawns, /^\s+1\s+INHERITED\s+loose-agent$/m);
  assert.match(spawns, /^\s+1\s+sonnet\s+general-purpose$/m);
  assert.match(spawns, /^ {2}2 of 4 spawns \(50%\) inherited the caller model$/m);
  assert.match(spawns, /^ {2}1 routed by agent definition$/m);
});

test("MCP calls are counted per server from assistant tool_use entries only", (t) => {
  const home = fakeHome(t);
  jsonl(home, ".claude/projects/proj/session.jsonl", [
    assistant([toolUse("mcp__github__create_issue"), toolUse("Read")]),
    assistant([toolUse("mcp__github__list_issues")]),
    assistant([toolUse("mcp__my-server__run")]),
    { type: "attachment", tools: [{ name: "mcp__listed_only__tool" }] },
    {
      type: "user",
      message: { content: [{ type: "tool_use", name: "mcp__not_assistant__tool" }] },
    },
  ]);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  const calls = section(result.stdout, 5);
  assert.match(calls, /^\s+2\s+github$/m);
  assert.match(calls, /^\s+1\s+my-server$/m);
  assert.doesNotMatch(calls, /listed_only|not_assistant|Read/);
});

test("a transcript with no MCP calls reports none", (t) => {
  const home = fakeHome(t);
  jsonl(home, ".claude/projects/proj/session.jsonl", [assistant([toolUse("Read")])]);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(section(result.stdout, 5), /^ {2}none$/m);
});

test("only tool results over 10,000 characters count as oversized", (t) => {
  const home = fakeHome(t);
  jsonl(home, ".claude/projects/proj/session.jsonl", [
    { type: "user", toolUseResult: "x".repeat(10000) },
    { type: "user", toolUseResult: "x".repeat(10001) },
  ]);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    section(result.stdout, 4),
    /^ {2}1 results over 10,000 chars: 0\.0 MB total, largest 10001 chars$/m,
  );
});

test("Codex totals sum per-response usage records and report the re-read share", (t) => {
  const home = fakeHome(t);
  const running = { input_tokens: 9e9, output_tokens: 9e9 };
  jsonl(home, ".codex/sessions/2026/01/01/rollout.jsonl", [
    { type: "turn_context", payload: { model: "codex-model", effort: "high" } },
    {
      type: "token_usage_record",
      payload: {
        usage: {
          input_tokens: 1e6,
          cached_input_tokens: 6e5,
          cache_write_input_tokens: 1e5,
          output_tokens: 2e5,
          reasoning_output_tokens: 5e4,
        },
        turn_token_usage: running,
        thread_token_usage: running,
      },
    },
    { type: "turn_context", payload: { model: "codex-model", effort: "high" } },
    {
      type: "token_usage_record",
      payload: {
        usage: {
          input_tokens: 1e6,
          cached_input_tokens: 3e5,
          cache_write_input_tokens: 0,
          output_tokens: 3e5,
          reasoning_output_tokens: 5e4,
        },
      },
    },
    { type: "compacted" },
  ]);
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ {2}no Claude Code transcripts in the window$/m);
  const codex = section(result.stdout, 6);
  assert.match(codex, /^\s+2\s+codex-model\s+high$/m);
  assert.match(codex, /^ {2}input 2\.0M {2}output 0\.50M \(reasoning 0\.10M\) {2}total 2\.5M$/m);
  assert.match(
    codex,
    /^ {2}context re-read: 0\.9M cached \+ 0\.1M cache-write = 40% of all tokens$/m,
  );
  assert.match(codex, /^ {2}compactions: 1$/m);
});
