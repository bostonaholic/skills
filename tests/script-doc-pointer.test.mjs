// Fails when a bundled skill script ends its own failure without exactly one last stderr
// line `see <absolute path>`, or when that path is not the real path of an existing skill
// file: a missing or duplicated pointer, a pointer before the script's last line, a
// logical `..` resolved through a symlinked scripts directory, an unquoted path broken by
// a space, a shared copy that names another skill's doc, or a target that does not exist.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";

const REPO = realpathSync(resolve("."));
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const INTERPRETERS = { bash: BASH, node: process.execPath };

// The scratch directory's name holds a space, so an unquoted expansion splits the path.
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "script doc pointer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, name, text) {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), text);
  return join(dir, name);
}

// Runs the script through a symlink to its real scripts directory, with a PATH that holds
// only the interpreter, so a script that resolves its path logically, or with dirname,
// realpath, or readlink, names the wrong file or none.
function runThroughLink(t, row) {
  const dir = scratch(t);
  const link = join(dir, "scripts");
  symlinkSync(resolve(REPO, dirname(row.script)), link);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  symlinkSync(INTERPRETERS[row.interpreter], join(bin, row.interpreter));
  return spawnSync(
    INTERPRETERS[row.interpreter],
    [join(link, basename(row.script)), ...row.args(dir)],
    { cwd: dir, encoding: "utf8", env: { PATH: bin, HOME: dir } },
  );
}

function seeLines(stderr) {
  return stderr.split("\n").filter((line) => line.startsWith("see "));
}

function lastLine(stderr) {
  return stderr.replace(/\n$/, "").split("\n").at(-1);
}

const none = () => [];

const ROWS = [
  // landing-prs
  {
    label: "preflight.sh",
    script: "skills/engineering/landing-prs/scripts/preflight.sh",
    interpreter: "bash",
    args: () => ["abc"],
    exit: 2,
    target: "skills/engineering/landing-prs/SKILL.md",
  },
  {
    label: "merge.sh",
    script: "skills/engineering/landing-prs/scripts/merge.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/landing-prs/SKILL.md",
  },
  {
    label: "ci-gate.mjs",
    script: "skills/engineering/landing-prs/scripts/ci-gate.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/landing-prs/SKILL.md",
  },
  // PR feedback scripts
  {
    label: "root shared/scripts/fetch-pr-feedback.mjs",
    script: "shared/scripts/fetch-pr-feedback.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 2,
    target: "shared/pull-request-comments.md",
  },
  {
    label: "addressing-pr-comments shared/scripts/fetch-pr-feedback.mjs",
    script: "skills/engineering/addressing-pr-comments/shared/scripts/fetch-pr-feedback.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 2,
    target: "skills/engineering/addressing-pr-comments/shared/pull-request-comments.md",
  },
  {
    label: "investigating-design-rationale shared/scripts/fetch-pr-feedback.mjs",
    script:
      "skills/engineering/investigating-design-rationale/shared/scripts/fetch-pr-feedback.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 2,
    target: "skills/engineering/investigating-design-rationale/shared/pull-request-comments.md",
  },
  {
    label: "watching-authored-prs shared/scripts/fetch-pr-feedback.mjs",
    script: "skills/engineering/watching-authored-prs/shared/scripts/fetch-pr-feedback.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 2,
    target: "skills/engineering/watching-authored-prs/shared/pull-request-comments.md",
  },
  {
    label: "watching-reviewed-prs shared/scripts/fetch-pr-feedback.mjs",
    script: "skills/engineering/watching-reviewed-prs/shared/scripts/fetch-pr-feedback.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 2,
    target: "skills/engineering/watching-reviewed-prs/shared/pull-request-comments.md",
  },
  {
    label: "re-request-review.mjs",
    script: "skills/engineering/addressing-pr-comments/scripts/re-request-review.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/addressing-pr-comments/references/review-re-request.md",
  },
  {
    label: "build-items.mjs",
    script: "skills/engineering/addressing-pr-comments/scripts/build-items.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/addressing-pr-comments/SKILL.md",
  },
  {
    label: "settle-item.mjs usage",
    script: "skills/engineering/addressing-pr-comments/scripts/settle-item.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/addressing-pr-comments/SKILL.md",
  },
  {
    label: "settle-item.mjs missing gh",
    script: "skills/engineering/addressing-pr-comments/scripts/settle-item.mjs",
    interpreter: "node",
    args: (dir) => {
      const pr = { host: "github.com", owner: "o", repo: "r", number: 1 };
      const item = { kind: "review", id: "R_1", url: "https://x/1", reactionSubject: "R_1" };
      return [
        write(dir, "items.json", JSON.stringify({ pr, items: [item] })),
        "R_1",
        "--reply-file",
        write(dir, "reply.md", "Done.\n"),
        "--react",
        "none",
      ];
    },
    exit: 127,
    target: "skills/engineering/addressing-pr-comments/SKILL.md",
  },
  // simplifying-ruby-code
  {
    label: "find-callers.sh usage",
    script: "skills/engineering/simplifying-ruby-code/scripts/find-callers.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/simplifying-ruby-code/SKILL.md",
  },
  {
    label: "find-callers.sh missing tool",
    script: "skills/engineering/simplifying-ruby-code/scripts/find-callers.sh",
    interpreter: "bash",
    args: (dir) => ["Point", dir],
    exit: 3,
    target: "skills/engineering/simplifying-ruby-code/SKILL.md",
  },
  // watching-authored-prs
  {
    label: "watching-authored-prs poll.mjs",
    script: "skills/engineering/watching-authored-prs/scripts/poll.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-authored-prs/SKILL.md",
  },
  {
    label: "watching-authored-prs poll.mjs missing gh",
    script: "skills/engineering/watching-authored-prs/scripts/poll.mjs",
    interpreter: "node",
    args: (dir) => [
      "https://github.com/o/r/pull/1",
      "--state",
      join(dir, "state.json"),
      "--out",
      join(dir, "feedback.json"),
      "--feedback-grant",
      "authorized",
      "--ci-grant",
      "report",
    ],
    exit: 127,
    target: "skills/engineering/watching-authored-prs/SKILL.md",
  },
  {
    label: "ci-log.sh usage",
    script: "skills/engineering/watching-authored-prs/scripts/ci-log.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-authored-prs/SKILL.md",
  },
  {
    label: "ci-log.sh missing gh",
    script: "skills/engineering/watching-authored-prs/scripts/ci-log.sh",
    interpreter: "bash",
    args: (dir) => ["github.com", "o/r", "7", join(dir, "log.txt")],
    exit: 127,
    target: "skills/engineering/watching-authored-prs/SKILL.md",
  },
  {
    label: "ci-fix-preflight.mjs usage",
    script: "skills/engineering/watching-authored-prs/scripts/ci-fix-preflight.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-authored-prs/references/ci-fix.md",
  },
  {
    label: "ci-fix-preflight.mjs missing git",
    script: "skills/engineering/watching-authored-prs/scripts/ci-fix-preflight.mjs",
    interpreter: "node",
    args: () => ["https://github.com/o/r/pull/1", "a".repeat(40)],
    exit: 127,
    target: "skills/engineering/watching-authored-prs/references/ci-fix.md",
  },
  // watching-reviewed-prs
  {
    label: "arm.mjs usage",
    script: "skills/engineering/watching-reviewed-prs/scripts/arm.mjs",
    interpreter: "node",
    args: () => ["7", "8"],
    exit: 2,
    target: "skills/engineering/watching-reviewed-prs/references/arm.md",
  },
  {
    label: "arm.mjs missing gh",
    script: "skills/engineering/watching-reviewed-prs/scripts/arm.mjs",
    interpreter: "node",
    args: none,
    exit: 127,
    target: "skills/engineering/watching-reviewed-prs/references/arm.md",
  },
  {
    label: "watching-reviewed-prs poll.mjs",
    script: "skills/engineering/watching-reviewed-prs/scripts/poll.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-reviewed-prs/SKILL.md",
  },
  {
    label: "render-approval.mjs",
    script: "skills/engineering/watching-reviewed-prs/scripts/render-approval.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-reviewed-prs/references/approve.md",
  },
  {
    label: "verify-approval.mjs usage",
    script: "skills/engineering/watching-reviewed-prs/scripts/verify-approval.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/watching-reviewed-prs/references/approve.md",
  },
  {
    label: "verify-approval.mjs missing gh",
    script: "skills/engineering/watching-reviewed-prs/scripts/verify-approval.mjs",
    interpreter: "node",
    args: () => ["https://github.com/o/r/pull/1", "me", "a".repeat(40)],
    exit: 127,
    target: "skills/engineering/watching-reviewed-prs/references/approve.md",
  },
  // removing-comments, summarizing-friction-logs
  {
    label: "changed-files.sh",
    script: "skills/engineering/removing-comments/scripts/changed-files.sh",
    interpreter: "bash",
    args: () => ["unexpected"],
    exit: 2,
    target: "skills/engineering/removing-comments/SKILL.md",
  },
  {
    label: "check-report.mjs usage",
    script: "skills/engineering/removing-comments/scripts/check-report.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/removing-comments/SKILL.md",
  },
  {
    label: "check-report.mjs invalid report",
    script: "skills/engineering/removing-comments/scripts/check-report.mjs",
    interpreter: "node",
    args: (dir) => [write(dir, "scope.txt", "lib/a.rb\n")],
    exit: 1,
    target: "skills/engineering/removing-comments/SKILL.md",
  },
  {
    label: "collect-friction.mjs",
    script: "skills/engineering/summarizing-friction-logs/scripts/collect-friction.mjs",
    interpreter: "node",
    args: () => ["--bogus"],
    exit: 1,
    target: "skills/engineering/summarizing-friction-logs/SKILL.md",
  },
  // rebasing-branches, redoing-implementations
  {
    label: "prepare-rebase.sh",
    script: "skills/engineering/rebasing-branches/scripts/prepare-rebase.sh",
    interpreter: "bash",
    args: none,
    exit: 1,
    target: "skills/engineering/rebasing-branches/SKILL.md",
  },
  {
    label: "publish.sh",
    script: "skills/engineering/rebasing-branches/scripts/publish.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/rebasing-branches/SKILL.md",
  },
  {
    label: "save-and-reset-attempt.sh",
    script: "skills/engineering/redoing-implementations/scripts/save-and-reset-attempt.sh",
    interpreter: "bash",
    args: none,
    exit: 3,
    target: "skills/engineering/redoing-implementations/SKILL.md",
  },
  // rebasing-open-prs
  {
    label: "list-prs.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/list-prs.sh",
    interpreter: "bash",
    args: none,
    exit: 127,
    target: "skills/engineering/rebasing-open-prs/SKILL.md",
  },
  {
    label: "init-run.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/init-run.sh",
    interpreter: "bash",
    args: none,
    exit: 127,
    target: "skills/engineering/rebasing-open-prs/SKILL.md",
  },
  {
    label: "reconcile.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/reconcile.sh",
    interpreter: "bash",
    args: none,
    exit: 127,
    target: "skills/engineering/rebasing-open-prs/SKILL.md",
  },
  {
    label: "prepare-worktree.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/prepare-worktree.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/rebasing-open-prs/references/per-pr-procedure.md",
  },
  {
    label: "check-range-diff.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/check-range-diff.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/rebasing-open-prs/references/per-pr-procedure.md",
  },
  {
    label: "write-result.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/write-result.sh",
    interpreter: "bash",
    args: none,
    exit: 127,
    target: "skills/engineering/rebasing-open-prs/references/per-pr-procedure.md",
  },
  {
    label: "cleanup-worktree.sh",
    script: "skills/engineering/rebasing-open-prs/scripts/cleanup-worktree.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/rebasing-open-prs/references/per-pr-procedure.md",
  },
  // grooming-backlogs
  {
    label: "load-board.sh",
    script: "skills/engineering/grooming-backlogs/scripts/load-board.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/grooming-backlogs/references/board-mode.md",
  },
  {
    label: "load-board.sh --issue",
    script: "skills/engineering/grooming-backlogs/scripts/load-board.sh",
    interpreter: "bash",
    args: (dir) => [join(dir, "missing"), "3", "acme", "--issue", "7"],
    exit: 64,
    target: "skills/engineering/grooming-backlogs/references/promotion-mode.md",
  },
  {
    label: "set-status.sh",
    script: "skills/engineering/grooming-backlogs/scripts/set-status.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/grooming-backlogs/references/tracker-recipes.md",
  },
  {
    label: "link-blocked-by.sh",
    script: "skills/engineering/grooming-backlogs/scripts/link-blocked-by.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/grooming-backlogs/references/tracker-recipes.md",
  },
  {
    label: "close-issue.sh",
    script: "skills/engineering/grooming-backlogs/scripts/close-issue.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/grooming-backlogs/references/closures.md",
  },
  {
    label: "gap-inventory.mjs",
    script: "skills/engineering/grooming-backlogs/scripts/gap-inventory.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/grooming-backlogs/references/board-mode.md",
  },
  {
    label: "ready-slots.mjs",
    script: "skills/engineering/grooming-backlogs/scripts/ready-slots.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/grooming-backlogs/SKILL.md",
  },
  // merging-dependabot-prs
  {
    label: "analyze.mjs",
    script: "skills/engineering/merging-dependabot-prs/scripts/analyze.mjs",
    interpreter: "node",
    args: () => ["abc"],
    exit: 2,
    target: "skills/engineering/merging-dependabot-prs/SKILL.md",
  },
  {
    label: "render-plan.mjs",
    script: "skills/engineering/merging-dependabot-prs/scripts/render-plan.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/merging-dependabot-prs/SKILL.md",
  },
  {
    label: "act.mjs",
    script: "skills/engineering/merging-dependabot-prs/scripts/act.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/merging-dependabot-prs/SKILL.md",
  },
  // attaching-pr-screenshots
  {
    label: "resolve-pr.sh",
    script: "skills/engineering/attaching-pr-screenshots/scripts/resolve-pr.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "pre-image.sh",
    script: "skills/engineering/attaching-pr-screenshots/scripts/pre-image.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "upload.sh",
    script: "skills/engineering/attaching-pr-screenshots/scripts/upload.sh",
    interpreter: "bash",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "splice.mjs usage",
    script: "skills/engineering/attaching-pr-screenshots/scripts/splice.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "splice.mjs --check refusal",
    script: "skills/engineering/attaching-pr-screenshots/scripts/splice.mjs",
    interpreter: "node",
    args: (dir) => ["--check", "--body-file", write(dir, "body.md", 'Before <img src="a.png">\n')],
    exit: 1,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "asset-url.mjs",
    script: "skills/engineering/attaching-pr-screenshots/scripts/asset-url.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "write-body.mjs usage",
    script: "skills/engineering/attaching-pr-screenshots/scripts/write-body.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "write-body.mjs refusal",
    script: "skills/engineering/attaching-pr-screenshots/scripts/write-body.mjs",
    interpreter: "node",
    args: (dir) => {
      const run = join(dir, "run");
      const entries = { entries: [{ path: "/s/a.png", caption: "a" }] };
      for (const [name, text] of Object.entries({
        "upload-exit": "3\n",
        "pr-host": "github.com\n",
        number: "7\n",
        "repo-spec": "github.com/o/r\n",
        "entries-file": `${write(dir, "entries.json", JSON.stringify(entries))}\n`,
        "assets.tsv": "",
        "failures.tsv": "",
        "pre-image.md": 'Before <img src="a.png">\n',
      }))
        write(run, name, text);
      chmodSync(write(dir, "bin/gh", ""), 0o755);
      return [run];
    },
    exit: 1,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  {
    label: "write-result.mjs",
    script: "skills/engineering/attaching-pr-screenshots/scripts/write-result.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/attaching-pr-screenshots/SKILL.md",
  },
  // verifying-production-changes
  {
    label: "deploy-gate.sh",
    script: "skills/engineering/verifying-production-changes/scripts/deploy-gate.sh",
    interpreter: "bash",
    args: () => ["--bogus"],
    exit: 2,
    target: "skills/engineering/verifying-production-changes/SKILL.md",
  },
  // auditing-agent-token-usage, freeing-disk-space
  {
    label: "audit-token-usage.sh",
    script: "skills/engineering/auditing-agent-token-usage/scripts/audit-token-usage.sh",
    interpreter: "bash",
    args: () => ["zero"],
    exit: 64,
    target: "skills/engineering/auditing-agent-token-usage/SKILL.md",
  },
  {
    label: "measure-caches.sh",
    script: "skills/engineering/freeing-disk-space/scripts/measure-caches.sh",
    interpreter: "bash",
    args: () => ["unexpected"],
    exit: 64,
    target: "skills/engineering/freeing-disk-space/SKILL.md",
  },
  {
    label: "list-pinned-versions.sh",
    script: "skills/engineering/freeing-disk-space/scripts/list-pinned-versions.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/freeing-disk-space/SKILL.md",
  },
  // code audits
  {
    label: "inventory.mjs",
    script: "skills/engineering/auditing-complexity/scripts/inventory.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/auditing-complexity/SKILL.md",
  },
  {
    label: "auditing-complexity render-report.mjs",
    script: "skills/engineering/auditing-complexity/scripts/render-report.mjs",
    interpreter: "node",
    args: (dir) => {
      write(dir, "audit/inventory.json", "{}\n");
      return [write(dir, "audit/report.json", "{}\n")];
    },
    exit: 1,
    target: "skills/engineering/auditing-complexity/SKILL.md",
  },
  {
    label: "auditing-tests render-report.mjs",
    script: "skills/engineering/auditing-tests/scripts/render-report.mjs",
    interpreter: "node",
    args: (dir) => [write(dir, "audit/report.json", "{}\n")],
    exit: 1,
    target: "skills/engineering/auditing-tests/SKILL.md",
  },
  {
    label: "find-leads.mjs",
    script: "skills/engineering/auditing-rails-tech-debt/scripts/find-leads.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/auditing-rails-tech-debt/SKILL.md",
  },
  {
    label: "scan-patterns.sh",
    script: "skills/engineering/auditing-repo-security/scripts/scan-patterns.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/engineering/auditing-repo-security/SKILL.md",
  },
  {
    label: "scan-deps.mjs",
    script: "skills/engineering/auditing-repo-security/scripts/scan-deps.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/auditing-repo-security/SKILL.md",
  },
  {
    label: "score.mjs",
    script: "skills/engineering/auditing-repo-security/scripts/score.mjs",
    interpreter: "node",
    args: () => ["unexpected"],
    exit: 2,
    target: "skills/engineering/auditing-repo-security/SKILL.md",
  },
  // capturing-screenshots
  {
    label: "shoot.mjs",
    script: "skills/engineering/capturing-screenshots/scripts/shoot.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/capturing-screenshots/SKILL.md",
  },
  {
    label: "png-check.mjs",
    script: "skills/engineering/capturing-screenshots/scripts/png-check.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/capturing-screenshots/SKILL.md",
  },
  {
    label: "finalize.mjs",
    script: "skills/engineering/capturing-screenshots/scripts/finalize.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/engineering/capturing-screenshots/SKILL.md",
  },
  {
    label: "finalize.mjs invalid input",
    script: "skills/engineering/capturing-screenshots/scripts/finalize.mjs",
    interpreter: "node",
    args: (dir) => [dir, write(dir, "frames.json", "{}\n")],
    exit: 2,
    target: "skills/engineering/capturing-screenshots/SKILL.md",
  },
  // learning-from-mistakes
  {
    label: "resolve-instructions-file.sh usage",
    script: "skills/productivity/learning-from-mistakes/scripts/resolve-instructions-file.sh",
    interpreter: "bash",
    args: none,
    exit: 1,
    target: "skills/productivity/learning-from-mistakes/SKILL.md",
  },
  {
    label: "resolve-instructions-file.sh unknown scope",
    script: "skills/productivity/learning-from-mistakes/scripts/resolve-instructions-file.sh",
    interpreter: "bash",
    args: () => ["claude", "team"],
    exit: 1,
    target: "skills/productivity/learning-from-mistakes/SKILL.md",
  },
  {
    label: "resolve-instructions-file.sh missing git",
    script: "skills/productivity/learning-from-mistakes/scripts/resolve-instructions-file.sh",
    interpreter: "bash",
    args: () => ["claude", "project"],
    exit: 69,
    target: "skills/productivity/learning-from-mistakes/SKILL.md",
  },
  // pricing-creativity
  {
    label: "price-calc.mjs usage",
    script: "skills/productivity/pricing-creativity/scripts/price-calc.mjs",
    interpreter: "node",
    args: none,
    exit: 2,
    target: "skills/productivity/pricing-creativity/SKILL.md",
  },
  {
    label: "price-calc.mjs invalid input",
    script: "skills/productivity/pricing-creativity/scripts/price-calc.mjs",
    interpreter: "node",
    args: () => ["ceiling", "$5"],
    exit: 1,
    target: "skills/productivity/pricing-creativity/SKILL.md",
  },
  // running-retros, summarizing-shipped-work
  {
    label: "resolve-transcript.mjs usage",
    script: "skills/productivity/running-retros/scripts/resolve-transcript.mjs",
    interpreter: "node",
    args: none,
    exit: 1,
    target: "skills/productivity/running-retros/references/reading-sources.md",
  },
  {
    label: "resolve-transcript.mjs unreadable-transcript",
    script: "skills/productivity/running-retros/scripts/resolve-transcript.mjs",
    interpreter: "node",
    args: (dir) => [dir, "--file", join(dir, "missing.jsonl")],
    exit: 1,
    target: "skills/productivity/running-retros/references/reading-sources.md",
  },
  {
    label: "write-target.mjs usage",
    script: "skills/productivity/running-retros/scripts/write-target.mjs",
    interpreter: "node",
    args: none,
    exit: 1,
    target: "skills/productivity/running-retros/references/applying-edits.md",
  },
  {
    label: "write-target.mjs refusal",
    script: "skills/productivity/running-retros/scripts/write-target.mjs",
    interpreter: "node",
    args: (dir) => [dir, "--path", "../x"],
    exit: 1,
    target: "skills/productivity/running-retros/references/applying-edits.md",
  },
  {
    label: "check-edit-target.sh usage",
    script: "skills/productivity/running-retros/scripts/check-edit-target.sh",
    interpreter: "bash",
    args: none,
    exit: 1,
    target: "skills/productivity/running-retros/references/applying-edits.md",
  },
  {
    label: "check-edit-target.sh missing git",
    script: "skills/productivity/running-retros/scripts/check-edit-target.sh",
    interpreter: "bash",
    args: (dir) => [dir, "x.md", "absent"],
    exit: 1,
    target: "skills/productivity/running-retros/references/applying-edits.md",
  },
  {
    label: "file-issue.sh usage",
    script: "skills/productivity/running-retros/scripts/file-issue.sh",
    interpreter: "bash",
    args: none,
    exit: 1,
    target: "skills/productivity/running-retros/references/filing-issues.md",
  },
  {
    label: "file-issue.sh missing gh",
    script: "skills/productivity/running-retros/scripts/file-issue.sh",
    interpreter: "bash",
    args: (dir) => [dir, "1"],
    exit: 1,
    target: "skills/productivity/running-retros/references/filing-issues.md",
  },
  {
    label: "list-sessions.mjs usage",
    script: "skills/productivity/running-retros/scripts/list-sessions.mjs",
    interpreter: "node",
    args: none,
    exit: 1,
    target: "skills/productivity/running-retros/references/reading-sources.md",
  },
  {
    label: "list-sessions.mjs named failure",
    script: "skills/productivity/running-retros/scripts/list-sessions.mjs",
    interpreter: "node",
    args: (dir) => [dir, "3"],
    exit: 1,
    target: "skills/productivity/running-retros/references/reading-sources.md",
  },
  {
    label: "fetch-shipped-prs.sh",
    script: "skills/productivity/summarizing-shipped-work/scripts/fetch-shipped-prs.sh",
    interpreter: "bash",
    args: none,
    exit: 64,
    target: "skills/productivity/summarizing-shipped-work/SKILL.md",
  },
  {
    label: "resolve-timeframe.mjs usage",
    script: "skills/productivity/summarizing-shipped-work/scripts/resolve-timeframe.mjs",
    interpreter: "node",
    args: none,
    exit: 64,
    target: "skills/productivity/summarizing-shipped-work/SKILL.md",
  },
  {
    label: "resolve-timeframe.mjs unknown period",
    script: "skills/productivity/summarizing-shipped-work/scripts/resolve-timeframe.mjs",
    interpreter: "node",
    args: () => ["next-week"],
    exit: 64,
    target: "skills/productivity/summarizing-shipped-work/SKILL.md",
  },
];

for (const row of ROWS) {
  test(`${row.label} ends its own failure with one see line that names its target's real path`, (t) => {
    const expected = join(REPO, row.target);
    const run = runThroughLink(t, row);
    assert.equal(run.status, row.exit, `exit code; stderr:\n${run.stderr}`);
    const pointers = seeLines(run.stderr);
    assert.equal(pointers.length, 1, `want one "see " line on stderr:\n${run.stderr}`);
    assert.equal(lastLine(run.stderr), pointers[0], `the see line is not last:\n${run.stderr}`);
    assert.equal(pointers[0], `see ${expected}`);
    assert.ok(existsSync(pointers[0].slice("see ".length)), `missing target ${pointers[0]}`);
  });
}
