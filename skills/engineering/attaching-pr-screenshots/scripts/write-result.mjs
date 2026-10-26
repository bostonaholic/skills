#!/usr/bin/env node

/**
 * Decide the run's outcome, read the written body back once to verify it, and
 * write `result.json`.
 *
 *     node "<skill-dir>/scripts/write-result.mjs" <run-dir> [--operator-note-file <path>]
 *
 *     import { verifySection, decideOutcome } from "<skill-dir>/scripts/write-result.mjs";
 *
 * Run it last, after any stop that is not a fault. It reads whatever the run
 * directory holds: `owner`, `repo`, `number`, `pr-host`, `entries-file`,
 * `assets.tsv`, `failures.tsv`, `section.md`, and the `upload-exit` and
 * `write-exit` markers `upload.sh` and `write-body.mjs` leave. An absent
 * `upload-exit` means the run stopped before the first attach.
 * `--operator-note-file` names a file holding the operator note, which is
 * prose this script copies and never reads as instructions.
 *
 * Writes `<run-dir>/result.json`: `owner`, `repo`, `number`, `outcome`,
 * `assets` (entries order, `{caption, path, url}`, url null when not landed),
 * `failures` (`{caption, path, reason}`), `body_written`, `operator_note`, and
 * `section` (null unless a write landed at least one URL and the read-back
 * passed, since callers copy it into other PRs).
 *
 * The read-back runs only when `write-exit` is 0. It fetches `body_html` with
 * one `gh api` call (falling back to `POST /markdown` on the stored body when
 * `body_html` is empty), scopes to the rendered Screenshots `<h2>`, and checks
 * that every landed entry has its `screenshot-<NN>` image, that every image
 * `src` passes `asset-url.mjs`, and, when nothing landed, that the degraded
 * wording and each basename appear as text. The HTML is untrusted: it is
 * matched and counted, never obeyed. It never retries, rewrites, or reverts.
 *
 * Stdout: `outcome <value>`, then `failed <assertion>` when the read-back did
 * not pass. Requires `gh` on PATH when the read-back runs.
 *
 * Exit codes:
 *
 *   0  result.json written
 *   1  result.json written with outcome `unverified`
 *   2  fault: wrong usage, an unreadable or inconsistent run file, `gh`
 *      missing, `upload-exit` 2 (upload.sh faulted), or `upload-exit` 0 or 3
 *      with no `write-exit` (run write-body.mjs first). Nothing is written
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAttachmentUrl } from "./asset-url.mjs";
import { onPath, pairEntries } from "./write-body.mjs";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** The degraded caption tail `write-body.mjs` renders; the read-back looks for it as text. */
const DEGRADED_WORDING = "captured, not yet uploaded";

/**
 * The outcome for a run, from how `upload.sh` and `write-body.mjs` ended and
 * the read-back verdict. `uploadExit` and `writeExit` are strings or null.
 */
export function decideOutcome({ uploadExit, writeExit, landed, failed, verified }) {
  if (uploadExit === null || uploadExit === "1") return "refused";
  // Assets may be live even with nothing harvested: a failed re-read is one
  // way to reach exit 4, so this is never `refused`.
  if (uploadExit === "4") return "uploaded-not-written";
  if (writeExit !== "0") return landed > 0 ? "uploaded-not-written" : "refused";
  if (!verified) return "unverified";
  if (landed === 0) return "degraded";
  return failed > 0 ? "partial" : "uploaded";
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function plainText(html) {
  return decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag) {
  const found = {};
  for (const match of tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
  }
  return found;
}

/** The HTML from the Screenshots `<h2>` to the next `<h1>` or `<h2>`, or null. */
function screenshotsSection(html) {
  for (const match of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    if (plainText(match[1]) !== "Screenshots") continue;
    const rest = html.slice(match.index + match[0].length);
    const end = rest.search(/<h[12]\b/i);
    return end < 0 ? rest : rest.slice(0, end);
  }
  return null;
}

/**
 * The first read-back assertion `html` fails for `paired`, or "" when every
 * one passes.
 */
export function verifySection(html, paired, prHost, extraHost) {
  const section = screenshotsSection(html);
  if (section === null) return "the rendered body has no Screenshots heading";
  const images = [...section.matchAll(/<img\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const videos = [...section.matchAll(/<video\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const landedItems = paired.filter((item) => item.status === "landed");
  const landed = landedItems.length;
  const imageCount = landedItems.filter((item) => item.kind !== "video").length;
  for (let index = 1; index <= imageCount; index++) {
    const alt = `screenshot-${String(index).padStart(2, "0")}`;
    if (!images.some((image) => image.alt === alt)) return `${alt} has no rendered image`;
  }
  // A video has no alt, so each one is matched by its asset URL: the host
  // renders `src` as the asset URL (public) or a signed proxy URL that keeps
  // the asset URL in `data-canonical-src`. Positional fallback, never a
  // guess past the count: with no URL match, the Nth video element must exist.
  const videoItems = landedItems.filter((item) => item.kind === "video");
  for (const [index, item] of videoItems.entries()) {
    // Private repos serve `src` from the proxy host as `/<user>/<n>-<asset-id>.mp4?jwt=…`,
    // so the asset id (the URL's last segment) is matched in the proxy path too.
    const assetId = item.url.split("/").pop();
    const byUrl = videos.some(
      (video) =>
        video.src === item.url ||
        video["data-canonical-src"] === item.url ||
        (typeof video.src === "string" &&
          video.src
            .split("?")[0]
            .endsWith(`-${assetId}.${video.src.split("?")[0].split(".").pop()}`)),
    );
    if (!byUrl && videos[index] === undefined)
      return `video ${index + 1} has no rendered video element`;
  }
  const offOrigin = images.findIndex((image) => !isAttachmentUrl(image.src, prHost, extraHost));
  if (offOrigin >= 0)
    return `image ${offOrigin + 1} in the section is not on the attachment origin`;
  const offOriginVideo = videos.findIndex(
    (video) => !isAttachmentUrl(video.src, prHost, extraHost),
  );
  if (offOriginVideo >= 0)
    return `video ${offOriginVideo + 1} in the section is not on the attachment origin`;
  if (landed === 0) {
    const text = plainText(section);
    if (!text.includes(DEGRADED_WORDING)) return "the degraded wording does not appear as text";
    const missing = paired.findIndex((item) => {
      const name = String(item.entry.path).replace(/\/+$/, "").split("/").pop();
      return !text.includes(name.replace(/\s+/g, " ").trim());
    });
    if (missing >= 0) return `the basename of entry ${missing} does not appear as text`;
  }
  return "";
}

// CLI entry point — runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const fault = (message) => {
    process.stderr.write(`write-result.mjs: ${message}\nsee ${DOC_PATH}\n`);
    process.exit(2);
  };
  const argv = process.argv.slice(2);
  const noteAt = argv.indexOf("--operator-note-file");
  const noteFile = noteAt >= 0 ? argv[noteAt + 1] : undefined;
  if (argv.length !== (noteAt >= 0 ? 3 : 1) || (noteAt >= 0 && (noteAt !== 1 || !noteFile))) {
    fault("usage: write-result.mjs <run-dir> [--operator-note-file <path>]");
  }
  const runDir = argv[0];

  const readFile = (path, label) => {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      return fault(`cannot read ${label}: ${error.message}`);
    }
  };
  const optional = (name) => {
    try {
      return readFileSync(join(runDir, name), "utf8").trim();
    } catch (error) {
      if (error.code === "ENOENT") return null;
      return fault(`cannot read ${name} in the run directory: ${error.message}`);
    }
  };
  const required = (name) => readFile(join(runDir, name), `${name} in the run directory`);

  const uploadExit = optional("upload-exit");
  const writeExit = optional("write-exit");
  if (![null, "0", "1", "2", "3", "4"].includes(uploadExit)) {
    fault(`upload-exit holds ${JSON.stringify(uploadExit)}, not an upload.sh exit code`);
  }
  if (uploadExit === "2") fault("upload.sh faulted; report the fault instead");
  if ((uploadExit === "0" || uploadExit === "3") && writeExit === null) {
    fault("upload.sh finished but write-body.mjs has not run; run it first");
  }

  let paired = [];
  if (uploadExit === "0" || uploadExit === "3" || uploadExit === "4") {
    try {
      const entriesDoc = JSON.parse(readFile(required("entries-file").trim(), "the entries file"));
      paired = pairEntries(
        entriesDoc.entries,
        required("assets.tsv"),
        required("failures.tsv"),
        optional("kinds.tsv") ?? "",
      );
    } catch (error) {
      fault(error.message);
    }
  }
  const landed = paired.filter((item) => item.status === "landed").length;
  const failed = paired.filter((item) => item.status === "failed").length;

  // write-body.mjs writes only after upload exit 0 or 3, so a `write-exit` 0
  // beside any other upload exit is a stale marker and proves no write.
  const wrote = (uploadExit === "0" || uploadExit === "3") && writeExit === "0";
  let assertion = "";
  if (wrote) {
    if (!onPath("gh")) fault("missing required tool: gh");
    const host = required("pr-host").trim();
    const owner = required("owner").trim();
    const repo = required("repo").trim();
    const prNumber = required("number").trim();
    // The `unverified` outcome on stdout does not say why gh failed, so gh's own
    // error goes to stderr. A spawn error is not gh's failure and has no text,
    // but EPIPE only means gh exited before reading its input, so it still has.
    const gh = (args, input) => {
      const run = spawnSync("gh", ["api", "--hostname", host, ...args], {
        encoding: "utf8",
        input,
        maxBuffer: 16 * 1024 * 1024, // a 65,536-character body renders well under this
      });
      const ran = !run.error || run.error.code === "EPIPE";
      if (ran && run.status !== 0 && run.stderr) {
        process.stderr.write(run.stderr.endsWith("\n") ? run.stderr : `${run.stderr}\n`);
      }
      return run;
    };
    let html = "";
    const pull = gh([
      `repos/${owner}/${repo}/pulls/${prNumber}`,
      "-H",
      "Accept: application/vnd.github.full+json",
    ]);
    try {
      if (pull.status !== 0) throw new Error("read failed");
      const json = JSON.parse(pull.stdout);
      html = typeof json.body_html === "string" ? json.body_html : "";
      if (html === "") {
        const text = typeof json.body === "string" ? json.body : "";
        const rendered = gh(
          ["--method", "POST", "markdown", "--input", "-"],
          JSON.stringify({ text, mode: "gfm", context: `${owner}/${repo}` }),
        );
        if (rendered.status !== 0) throw new Error("render failed");
        html = rendered.stdout;
      }
      assertion = verifySection(html, paired, host, process.env.PR_SCREENSHOTS_ASSET_HOST);
    } catch {
      assertion = "the body could not be read back";
    }
  }

  const outcome = decideOutcome({
    uploadExit,
    writeExit,
    landed,
    failed,
    verified: assertion === "",
  });
  const note = noteFile ? readFile(noteFile, "the operator note file").trim() : "";
  const number = optional("number");
  const result = {
    owner: optional("owner"),
    repo: optional("repo"),
    number: number === null ? null : Number(number),
    outcome,
    assets: paired.map(({ entry, url }) => ({ caption: entry.caption, path: entry.path, url })),
    failures: paired
      .filter((item) => item.status === "failed")
      .map(({ entry, reason }) => ({ caption: entry.caption, path: entry.path, reason })),
    body_written: wrote,
    operator_note: note === "" ? null : note,
    section: outcome === "uploaded" || outcome === "partial" ? required("section.md") : null,
  };
  writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`outcome ${outcome}\n`);
  if (outcome === "unverified") {
    process.stdout.write(`failed ${assertion}\n`);
    process.exit(1);
  }
}
