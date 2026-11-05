// Fails when check-playbook.mjs stops holding its contract: a command line in a playbook's shell
// block passes only when the transcript holds every fragment of it outside `<placeholder>` spans,
// a command typed with quotes matches through the tool call's JSON input, and the CLI reports
// unmatched lines by playbook line number with exit 1, a clean playbook with exit 0, and an
// unreadable or recordless input with exit 2.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  commandLines,
  fragmentsOf,
  haystackOf,
  unmatchedCommands,
} from "../skills/engineering/writing-playbooks/scripts/check-playbook.mjs";

const SCRIPT = resolve("skills/engineering/writing-playbooks/scripts/check-playbook.mjs");

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "writing-playbooks-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

const record = (text) => JSON.stringify({ type: "assistant", isUserTurn: false, text });
const toolUse = (command) => record(`[tool_use Bash] ${JSON.stringify({ command })}`);

const TRANSCRIPT = [
  JSON.stringify({ type: "user", isUserTurn: true, text: "QueueBacklogHigh is firing" }),
  toolUse("kubectl -n billing get pods -l app=billing-worker"),
  record("NAME READY STATUS\nbilling-worker-7d9f Running"),
  toolUse(
    'kubectl -n billing logs deploy/billing-worker --since=10m | grep -i "deadline exceeded"',
  ),
  toolUse("kubectl -n billing rollout undo deploy/ledger-service"),
].join("\n");

const PLAYBOOK = `# Playbook: QueueBacklogHigh

## Check

\`\`\`sh
kubectl -n billing get pods -l app=billing-worker
# look for a pod that is not Running
$ kubectl -n billing logs deploy/billing-worker --since=10m | grep -i "deadline exceeded"
\`\`\`

## Fix

\`\`\`bash
kubectl -n billing rollout undo deploy/<deployment>
kubectl -n billing rollout status deploy/ledger-service
\`\`\`

\`\`\`json
{"not": "a command"}
\`\`\`
`;

test("commandLines reads shell blocks only, dropping prompts and comments", () => {
  assert.deepEqual(commandLines(PLAYBOOK), [
    { line: 6, text: "kubectl -n billing get pods -l app=billing-worker" },
    {
      line: 8,
      text: 'kubectl -n billing logs deploy/billing-worker --since=10m | grep -i "deadline exceeded"',
    },
    { line: 14, text: "kubectl -n billing rollout undo deploy/<deployment>" },
    { line: 15, text: "kubectl -n billing rollout status deploy/ledger-service" },
  ]);
});

test("fragmentsOf drops placeholders and fragments too short to prove anything", () => {
  assert.deepEqual(fragmentsOf("kubectl -n <ns> rollout undo deploy/<deployment>"), [
    "kubectl -n",
    "rollout undo deploy/",
  ]);
  assert.deepEqual(fragmentsOf("<pod> <ns>"), []);
});

test("haystackOf includes tool call inputs so quoted commands match as typed", () => {
  const { records, haystack } = haystackOf(TRANSCRIPT);
  assert.equal(records, 5);
  assert.ok(haystack.includes('grep -i "deadline exceeded"'));
  assert.deepEqual(haystackOf("not json\n\n").records, 0);
});

test("unmatchedCommands keeps only lines the transcript does not hold", () => {
  const { haystack } = haystackOf(TRANSCRIPT);
  assert.deepEqual(
    unmatchedCommands(commandLines(PLAYBOOK), haystack).map(({ line }) => line),
    [15],
  );
  assert.deepEqual(unmatchedCommands([{ line: 1, text: "<only> <placeholders>" }], haystack), [
    { line: 1, text: "<only> <placeholders>" },
  ]);
});

test("the CLI lists each unmatched line with exit 1 and exits 0 once every line matches", (t) => {
  const dir = scratch(t);
  const playbook = join(dir, "playbook.md");
  const transcript = join(dir, "transcript.jsonl");
  writeFileSync(playbook, PLAYBOOK);
  writeFileSync(transcript, TRANSCRIPT);

  const unmatched = run(playbook, transcript);
  assert.equal(unmatched.status, 1, unmatched.stderr);
  assert.equal(
    unmatched.stdout,
    "checked: 4\nunmatched: 1\n15: kubectl -n billing rollout status deploy/ledger-service\n",
  );

  writeFileSync(
    playbook,
    PLAYBOOK.replace("kubectl -n billing rollout status deploy/ledger-service\n", ""),
  );
  const clean = run(playbook, transcript);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, "checked: 3\nunmatched: 0\n");
});

test("the CLI exits 2 on a usage error, an unreadable file, or a transcript with no records", (t) => {
  const dir = scratch(t);
  const playbook = join(dir, "playbook.md");
  writeFileSync(playbook, PLAYBOOK);
  const empty = join(dir, "empty.jsonl");
  writeFileSync(empty, "plain text\n");

  for (const args of [[], [playbook], [playbook, empty, "extra"]]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^check-playbook\.mjs: usage: /);
  }
  const missing = run(playbook, join(dir, "missing.jsonl"));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read transcript/);
  const recordless = run(playbook, empty);
  assert.equal(recordless.status, 2);
  assert.match(recordless.stderr, /no JSON records/);
  assert.match(recordless.stderr, /\nsee \/.*SKILL\.md\n$/);
});
