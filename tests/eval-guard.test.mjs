// Fails when an eval entry point starts claude outside its own npm script, so npm test or CI
// would spend money. A claude stub first on PATH logs each call; a guard that
// lets a run through reaches the stub, never the real claude.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const ENTRY_POINTS = [
  { script: "scripts/eval.mjs", args: ["reviewing-code", "--check"], npmScript: "eval" },
  { script: "scripts/eval-handoff.mjs", args: [], npmScript: "eval:handoff" },
];

// `lifecycle` sets npm_lifecycle_event; undefined removes it.
function guardedRun(t, { script, args }, lifecycle) {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), "eval-guard-")));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const calls = join(bin, "claude-calls.log");
  writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$@" >>'${calls}'\nexit 1\n`);
  chmodSync(join(bin, "claude"), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.npm_lifecycle_event;
  if (lifecycle !== undefined) env.npm_lifecycle_event = lifecycle;
  const run = spawnSync(process.execPath, [resolve(script), ...args], { env, encoding: "utf8" });
  return { run, calls };
}

for (const entry of ENTRY_POINTS) {
  const other = ENTRY_POINTS.find((e) => e !== entry).npmScript;
  test(`${entry.script} starts claude only under npm run ${entry.npmScript}`, async (t) => {
    for (const lifecycle of [undefined, "test", other]) {
      await t.test(`refuses with npm_lifecycle_event=${lifecycle ?? "(unset)"}`, (st) => {
        const { run, calls } = guardedRun(st, entry, lifecycle);
        assert.equal(run.status, 2, run.stderr);
        assert.match(run.stderr, /start claude only through npm run /);
        assert.equal(existsSync(calls), false, "the run reached claude");
      });
    }
    await t.test(`reaches claude under npm run ${entry.npmScript}`, (st) => {
      const { run, calls } = guardedRun(st, entry, entry.npmScript);
      assert.ok(existsSync(calls), `the run never reached claude:\n${run.stderr}`);
      assert.ok(readFileSync(calls, "utf8").length > 0);
    });
  });
}
