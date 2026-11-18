// Fails when a skill script's CLI entry guard skips the CLI for a script run through a
// symlinked directory (as under macOS /tmp → /private/tmp), or runs it on import.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const IMPORTER =
  'import { pathToFileURL } from "node:url";\nawait import(pathToFileURL(process.argv[2]).href);\n';

const E = "skills/engineering";
// [scripts directory, script, arguments that reach a usage error, that error's exit status]
const SCRIPTS = [
  ["shared/scripts", "resolve-transcript.mjs", [], 1],
  ["shared/scripts", "fetch-pr-feedback.mjs", ["--bogus"], 2],
  ["shared/scripts", "contention.mjs", ["--bogus"], 2],
  [`${E}/writing-playbooks/scripts`, "check-playbook.mjs", [], 2],
  ["skills/productivity/reflecting/scripts", "write-target.mjs", [], 1],
  ["skills/productivity/reflecting/scripts", "list-sessions.mjs", [], 1],
  [`${E}/attaching-pr-screenshots/scripts`, "splice.mjs", [], 2],
  [`${E}/attaching-pr-screenshots/scripts`, "asset-url.mjs", [], 2],
  [`${E}/attaching-pr-screenshots/scripts`, "write-body.mjs", [], 2],
  [`${E}/attaching-pr-screenshots/scripts`, "copy-section.mjs", [], 2],
  [`${E}/attaching-pr-screenshots/scripts`, "write-result.mjs", [], 2],
  [`${E}/opening-prs/scripts`, "preflight.mjs", ["--bogus"], 2],
  [`${E}/updating-changelogs/scripts`, "changelog-candidates.mjs", [], 2],
  [`${E}/capturing-screenshots/scripts`, "png-check.mjs", [], 2],
  [`${E}/capturing-screenshots/scripts`, "shoot.mjs", [], 2],
  [`${E}/capturing-screenshots/scripts`, "finalize.mjs", [], 2],
  [`${E}/auditing-tests/scripts`, "render-report.mjs", [], 2],
  [`${E}/auditing-complexity/scripts`, "inventory.mjs", [], 2],
  [`${E}/auditing-complexity/scripts`, "render-report.mjs", [], 2],
  [`${E}/improving-codebases/scripts`, "list-lanes.mjs", ["stray"], 2],
  [`${E}/improving-codebases/scripts`, "render-report.mjs", [], 2],
  [`${E}/improving-codebases/scripts`, "checkpoint.mjs", [], 2],
  [`${E}/improving-codebases/scripts`, "run-bounded.mjs", [], 2],
  [`${E}/improving-codebases/scripts`, "run-tlc.mjs", [], 2],
  [`${E}/improving-codebases/scripts`, "churn.mjs", [], 2],
  [`${E}/addressing-pr-comments/scripts`, "re-request-review.mjs", [], 2],
  [`${E}/addressing-pr-comments/scripts`, "build-items.mjs", [], 2],
  [`${E}/addressing-pr-comments/scripts`, "settle-item.mjs", [], 2],
  [`${E}/summarizing-friction-logs/scripts`, "collect-friction.mjs", ["--bogus"], 1],
  [`${E}/merging-dependabot-prs/scripts`, "analyze.mjs", ["x", "x", "x", "x"], 2],
  [`${E}/merging-dependabot-prs/scripts`, "render-plan.mjs", ["x", "x", "x", "x"], 2],
  [`${E}/merging-dependabot-prs/scripts`, "act.mjs", ["x", "x", "x", "x"], 2],
  [`${E}/landing-prs/scripts`, "ci-gate.mjs", [], 2],
  [`${E}/auditing-repo-security/scripts`, "scan-deps.mjs", [], 2],
  [`${E}/auditing-repo-security/scripts`, "score.mjs", ["findings.json"], 2],
  [`${E}/auditing-rails-tech-debt/scripts`, "find-leads.mjs", [], 2],
  [`${E}/grooming-backlogs/scripts`, "gap-inventory.mjs", [], 2],
  [`${E}/grooming-backlogs/scripts`, "ready-slots.mjs", [], 2],
  ["skills/productivity/summarizing-shipped-work/scripts", "resolve-timeframe.mjs", [], 64],
  [`${E}/removing-comments/scripts`, "check-report.mjs", [], 2],
  [`${E}/watching-authored-prs/scripts`, "poll.mjs", [], 2],
  [`${E}/watching-authored-prs/scripts`, "ci-fix-preflight.mjs", [], 2],
  [`${E}/watching-reviewed-prs/scripts`, "arm.mjs", ["a", "b", "c", "d"], 2],
  [`${E}/watching-reviewed-prs/scripts`, "poll.mjs", ["a", "b", "c", "d"], 2],
  [`${E}/watching-reviewed-prs/scripts`, "render-approval.mjs", ["a", "b", "c", "d"], 2],
  [`${E}/watching-reviewed-prs/scripts`, "verify-approval.mjs", ["a", "b", "c", "d"], 2],
];

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "entry-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function symlinkedScript(t, dir, script) {
  const link = join(scratchDir(t), "link");
  symlinkSync(resolve(dir), link);
  return join(link, script);
}

test("every guarded script runs its CLI through a symlinked directory and not on import", async (t) => {
  for (const [dir, script, args, status] of SCRIPTS) {
    await t.test(`${dir}/${script}`, (st) => {
      const run = spawnSync(process.execPath, [symlinkedScript(st, dir, script), ...args], {
        encoding: "utf8",
      });
      assert.equal(run.status, status, run.stderr);
      assert.match(run.stderr, /usage/i);

      const importer = join(scratchDir(st), "importer.mjs");
      writeFileSync(importer, IMPORTER);
      const imported = spawnSync(process.execPath, [importer, symlinkedScript(st, dir, script)], {
        encoding: "utf8",
      });
      assert.deepEqual(
        { status: imported.status, stdout: imported.stdout, stderr: imported.stderr },
        { status: 0, stdout: "", stderr: "" },
      );
    });
  }
});
