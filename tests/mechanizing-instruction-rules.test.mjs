// Fails when list-rules.mjs stops finding a deny rule, hook script, or test that quotes a rule's
// command, reads a fence or table as a rule, lists a user or reference memory, or calls a memory
// enforced when its enforced-by path is gone; or when mark-enforced.mjs writes a memory before its
// check exists or leaves two enforced-by lines.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  codeSpans,
  instructionRules,
} from "../skills/incubating/mechanizing-instruction-rules/scripts/list-rules.mjs";
import { setEnforcedBy } from "../skills/incubating/mechanizing-instruction-rules/scripts/mark-enforced.mjs";

const SCRIPTS = resolve("skills/incubating/mechanizing-instruction-rules/scripts");

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "mechanizing-rules-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  return join(dir, path);
}

function memory(name, type, extra = "") {
  return `---\nname: ${name}\ndescription: ${name} rule\n${extra}metadata:\n  type: ${type}\n---\n\nBody.\n`;
}

// A repository whose only commit-free index holds one instruction file, a settings file with one deny
// rule and one hook, the hook's script, and one test; plus a memory root beside it.
function fixture(t) {
  const dir = scratch(t);
  const repo = join(dir, "repo");
  write(
    repo,
    "AGENTS.md",
    [
      "# Rules",
      "",
      "- Never pass `--no-verify` to a commit.",
      "- Always run `make release-check` before tagging.",
      "- Never edit `vendor/` by hand.",
      "",
      "```sh",
      "Never run `rm -rf /` here.",
      "```",
      "",
      "| Symptom | Fix |",
      "| ------- | --- |",
      "| Never `git push --force` | rebase |",
      "",
      "The site is built nightly.",
    ].join("\n"),
  );
  write(
    repo,
    ".claude/settings.json",
    JSON.stringify(
      {
        permissions: { deny: ["Bash(git commit *--no-verify*)"] },
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/bin/guard" }] }],
        },
      },
      null,
      2,
    ),
  );
  write(repo, "bin/guard", "#!/bin/sh\n# blocks gh pr merge without review\n");
  write(repo, "tests/release.test.sh", "make release-check\n");
  spawnSync("git", ["init", "-q", repo]);
  spawnSync("git", ["-C", repo, "add", "-A"]);

  const memoryRoot = join(dir, "projects");
  write(memoryRoot, "p1/memory/MEMORY.md", "- index\n");
  write(
    memoryRoot,
    "p1/memory/guarded.md",
    memory("guarded", "feedback", "") + "Use `gh pr merge` only after review.\n",
  );
  write(memoryRoot, "p1/memory/plain.md", memory("plain", "project"));
  write(memoryRoot, "p1/memory/who.md", memory("who", "user"));
  write(memoryRoot, "p1/memory/link.md", memory("link", "reference"));
  write(
    memoryRoot,
    "p2/memory/marked.md",
    memory("marked", "feedback", `enforced-by: ${join(repo, "bin/guard")}\n`),
  );
  write(
    memoryRoot,
    "p2/memory/gone.md",
    memory("gone", "feedback", `enforced-by: ${join(repo, "bin/missing")}\n`),
  );
  return { repo, memoryRoot };
}

function listRules(repo, memoryRoot) {
  const run = spawnSync(
    process.execPath,
    [join(SCRIPTS, "list-rules.mjs"), repo, "--memory-root", memoryRoot],
    {
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("instruction rules skip fences, tables, headings, and sentences with no rule word", () => {
  const rules = instructionRules(
    "# Never a heading\n\n- Never do A.\n  Use B. The sky is blue.\n\n```\nNever C.\n```\n\n| Never D |\n",
  );
  assert.deepEqual(rules, [
    { line: 3, text: "Never do A." },
    { line: 4, text: "Use B." },
  ]);
});

test("only command-shaped code spans count as check evidence", () => {
  assert.deepEqual(
    codeSpans("Use `git tag -s`, never `-a`, `status`, `AGENTS.md`, or `--no-ff`."),
    ["git tag -s", "--no-ff"],
  );
});

test("each instruction rule is check-found only when a deny rule, hook, or test quotes its span", (t) => {
  const { repo, memoryRoot } = fixture(t);
  const rules = listRules(repo, memoryRoot).rules.filter((rule) => rule.source === "instruction");
  const byText = Object.fromEntries(rules.map((rule) => [rule.text, rule]));
  assert.deepEqual(Object.keys(byText), [
    "Never pass `--no-verify` to a commit.",
    "Always run `make release-check` before tagging.",
    "Never edit `vendor/` by hand.",
  ]);
  const noVerify = byText["Never pass `--no-verify` to a commit."];
  assert.equal(noVerify.status, "check-found");
  assert.deepEqual(
    noVerify.checks.map((check) => [check.kind, check.path]),
    [["deny", ".claude/settings.json"]],
  );
  assert.deepEqual(
    byText["Always run `make release-check` before tagging."].checks.map((check) => check.kind),
    ["test"],
  );
  assert.equal(byText["Never edit `vendor/` by hand."].status, "uncovered");
});

test("memory rules: enforced-by wins, a missing path is stale, hooks count, user and reference are skipped", (t) => {
  const { repo, memoryRoot } = fixture(t);
  const rules = listRules(repo, memoryRoot).rules.filter((rule) => rule.source === "memory");
  assert.deepEqual(Object.fromEntries(rules.map((rule) => [rule.name, rule.status])), {
    guarded: "check-found",
    plain: "uncovered",
    marked: "enforced",
    gone: "stale",
  });
  const guarded = rules.find((rule) => rule.name === "guarded");
  assert.deepEqual(
    guarded.checks.map((check) => [check.kind, check.path]),
    [["hook", "bin/guard"]],
  );
});

test("list-rules exits 1 outside a git work tree and 2 on bad arguments", (t) => {
  const dir = scratch(t);
  const run = (args) =>
    spawnSync(process.execPath, [join(SCRIPTS, "list-rules.mjs"), ...args]).status;
  assert.equal(run([dir, "--memory-root", dir]), 1);
  assert.equal(run([]), 2);
  assert.equal(run([dir, "--memory-root"]), 2);
});

test("setEnforcedBy replaces an earlier enforced-by line and keeps the body", () => {
  const once = setEnforcedBy("---\nname: a\nenforced-by: /old\n---\nBody\n", "/new");
  assert.equal(once, "---\nname: a\nenforced-by: /new\n---\nBody\n");
  assert.throws(() => setEnforcedBy("no frontmatter\n", "/x"));
});

test("mark-enforced writes nothing until the check exists", (t) => {
  const dir = scratch(t);
  const path = write(dir, "m.md", memory("m", "feedback"));
  const before = readFileSync(path, "utf8");
  const run = (...args) =>
    spawnSync(process.execPath, [join(SCRIPTS, "mark-enforced.mjs"), ...args], { encoding: "utf8" })
      .status;

  assert.equal(run(path, join(dir, "hooks/guard")), 1);
  assert.equal(run(path, "hooks/guard"), 1);
  assert.equal(readFileSync(path, "utf8"), before);

  const check = write(dir, "hooks/guard", "#!/bin/sh\n");
  assert.equal(run(path, check), 0);
  assert.match(readFileSync(path, "utf8"), new RegExp(`^enforced-by: ${check}$`, "m"));
  assert.equal(run(path), 2);
});
