#!/usr/bin/env node

/**
 * Render the Screenshots section from the run's files, splice it into the
 * pre-image, and write the PR body once.
 *
 *     node "<skill-dir>/scripts/write-body.mjs" <run-dir>
 *
 *     import { renderSection, pairEntries, onPath } from "<skill-dir>/scripts/write-body.mjs";
 *
 * <run-dir> is the directory `upload.sh` finished in. This reads `pr-host`,
 * `number`, `repo-spec`, `entries-file` (and the entries JSON it names),
 * `pre-image.md`, `assets.tsv`, `failures.tsv`, and `upload-exit`, and writes:
 *
 *   section.md    the rendered section, rewritten on every run
 *   new-body.md   the spliced body, only when the splice allows the write
 *   write-exit    this script's exit code, written on every exit, so
 *                 `write-result.mjs` knows how it ended
 *
 * The body is always spliced from the pre-image, never from the live body, so
 * a rerun after a failed edit computes and writes the same body again.
 *
 * Requires `gh` on PATH.
 *
 * Stdout on success is the one line `written`. Exit codes:
 *
 *   0  the body was written
 *   1  the splice refused; stderr says `refused: <reason>` and the body is
 *      untouched
 *   2  fault: wrong usage, an unreadable or inconsistent run file, `gh`
 *      missing, or an `upload-exit` other than 0 or 3 (no body may be written
 *      after any other upload outcome). The body is untouched
 *   3  `gh pr edit` failed; the body may or may not have changed
 *
 * ## The section
 *
 * `splice.mjs` tells its own earlier output from text someone else typed by
 * the exact vocabulary rendered here, so this renderer emits nothing else. A
 * caption sits directly above its image, notes are `> _note:_` lines split by
 * a bare `>`, and nothing landed means the degraded form: one
 * `captured, not yet uploaded: <basename>` caption line per entry and no
 * failure lines. Every caller string goes through `normalize`, a path renders
 * as its basename only (the body is public), and the alt text is
 * `screenshot-<NN>`, never caller text.
 */

import { accessSync, constants, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isAttachmentUrl } from "./asset-url.mjs";
import { splice } from "./splice.mjs";

/**
 * One line, trimmed, whitespace collapsed, and every character markdown could
 * read as an image, link, or HTML backslash-escaped. A single pass escapes the
 * backslash along with the rest, so no caller backslash can undo an escape.
 */
export function normalize(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\![\]<>]/g, "\\$&");
}

/**
 * `state` also loses its parentheses: it renders inside `(<state>)`, and an
 * unbalanced one makes the next run's `--check` refuse this skill's own
 * section. Escaping would not do, since the character stays in place.
 */
function normalizeState(text) {
  return normalize(String(text ?? "").replace(/[()]/g, " "));
}

function tsvLines(text) {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) throw new Error(`a TSV line has no tab: ${JSON.stringify(line)}`);
      return { value: line.slice(0, tab), path: line.slice(tab + 1) };
    });
}

/**
 * Each entry in entries order, joined to its line in `assets.tsv` or
 * `failures.tsv`: `{entry, status, url, reason}`, `status` one of `landed`,
 * `failed`, or `not-attempted`. `upload.sh` writes exactly one line per entry,
 * in entries order, so both files are walked in step. Both empty means no
 * attach ran (the capability gap), and every entry is `not-attempted`.
 * Anything else that does not line up throws: a guessed pairing would put a
 * caption over the wrong image in a public body.
 */
export function pairEntries(entries, assetsText, failuresText) {
  const assets = tsvLines(assetsText);
  const failures = tsvLines(failuresText);
  if (assets.length === 0 && failures.length === 0) {
    return entries.map((entry) => ({ entry, status: "not-attempted", url: null, reason: null }));
  }
  let a = 0;
  let f = 0;
  const paired = entries.map((entry, index) => {
    const asset = assets[a]?.path === entry.path;
    const failure = failures[f]?.path === entry.path;
    if (asset && failure) {
      throw new Error(`entry ${index} repeats a path that both landed and failed`);
    }
    if (asset) return { entry, status: "landed", url: assets[a++].value, reason: null };
    if (failure) return { entry, status: "failed", url: null, reason: failures[f++].value };
    throw new Error(`assets.tsv and failures.tsv do not account for entry ${index}`);
  });
  if (a !== assets.length || f !== failures.length) {
    throw new Error("assets.tsv or failures.tsv holds a line no entry accounts for");
  }
  return paired;
}

function captionLine(entry) {
  const caption = normalize(entry.caption);
  if (caption === "") throw new Error("an entry has a blank caption");
  const state = normalizeState(entry.state);
  return state === "" ? `**${caption}**` : `**${caption}** (${state})`;
}

function basename(path) {
  const name = normalize(String(path).replace(/\/+$/, "").split("/").pop());
  if (name === "") throw new Error(`an entry path has no basename: ${JSON.stringify(path)}`);
  return name;
}

/** The section markdown for `paired`, with `notes` the entries file's notes list. */
export function renderSection(paired, notes = []) {
  const landed = paired.filter((item) => item.status === "landed");
  const blocks = ["## Screenshots"];
  if (landed.length > 0) {
    landed.forEach((item, index) => {
      const alt = `screenshot-${String(index + 1).padStart(2, "0")}`;
      blocks.push(`${captionLine(item.entry)}\n![${alt}](${item.url})`);
    });
  } else {
    for (const item of paired) {
      blocks.push(
        `${captionLine(item.entry)} — captured, not yet uploaded: ${basename(item.entry.path)}`,
      );
    }
  }
  const noteLines = (notes ?? []).map(normalize).filter((note) => note !== "");
  if (noteLines.length > 0) blocks.push(noteLines.map((note) => `> _note:_ ${note}`).join("\n>\n"));
  if (landed.length > 0) {
    for (const item of paired.filter((entry) => entry.status === "failed")) {
      blocks.push(`Not uploaded: ${normalize(item.entry.caption)} — ${normalize(item.reason)}`);
    }
  }
  return `${blocks.join("\n\n")}\n`;
}

/** True when `tool` is an executable on PATH; the CLIs check before any work. */
export function onPath(tool) {
  return (process.env.PATH ?? "").split(delimiter).some((dir) => {
    try {
      accessSync(join(dir, tool), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

// CLI entry point — runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const runDir = process.argv[2];
  const exit = (code, message) => {
    if (message) process.stderr.write(message);
    try {
      writeFileSync(join(runDir, "write-exit"), `${code}\n`);
    } catch {
      // A run directory that cannot take the marker is already a fault.
    }
    process.exit(code);
  };
  const fault = (message) => exit(2, `write-body.mjs: ${message}\n`);
  if (process.argv.length !== 3) fault("usage: write-body.mjs <run-dir>");

  const read = (name) => {
    try {
      return readFileSync(join(runDir, name), "utf8");
    } catch (error) {
      return fault(`cannot read ${name} in the run directory: ${error.message}`);
    }
  };

  const uploadExit = read("upload-exit").trim();
  if (uploadExit !== "0" && uploadExit !== "3") {
    fault(`upload.sh ended with exit ${uploadExit}, after which no body is written`);
  }
  if (!onPath("gh")) fault("missing required tool: gh");

  const prHost = read("pr-host").trim();
  const number = read("number").trim();
  const repoSpec = read("repo-spec").trim();
  const entriesFile = read("entries-file").trim();
  let entriesDoc;
  try {
    entriesDoc = JSON.parse(readFileSync(entriesFile, "utf8"));
  } catch (error) {
    fault(`cannot read the entries file: ${error.message}`);
  }

  let section;
  let landed;
  try {
    const paired = pairEntries(entriesDoc.entries, read("assets.tsv"), read("failures.tsv"));
    const extraHost = process.env.PR_SCREENSHOTS_ASSET_HOST;
    const offOrigin = paired.find(
      (item) => item.status === "landed" && !isAttachmentUrl(item.url, prHost, extraHost),
    );
    if (offOrigin) throw new Error("assets.tsv holds a URL off the attachment origin");
    section = renderSection(paired, entriesDoc.notes);
    landed = paired.filter((item) => item.status === "landed").length;
  } catch (error) {
    fault(error.message);
  }

  const newBody = join(runDir, "new-body.md");
  rmSync(newBody, { force: true });
  writeFileSync(join(runDir, "section.md"), section);
  const result = splice(read("pre-image.md"), section, { landed });
  if (!result.changed) exit(1, `refused: ${result.reason}\n`);
  writeFileSync(newBody, result.body);

  const edit = spawnSync("gh", ["pr", "edit", number, "--repo", repoSpec, "--body-file", newBody], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (edit.status !== 0) {
    exit(3, `write-body.mjs: gh pr edit failed (exit ${edit.status ?? edit.error?.code})\n`);
  }
  process.stdout.write("written\n");
  exit(0);
}
