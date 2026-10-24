---
name: attaching-pr-screenshots
description: Uploads local images through GitHub's attachment pipeline and writes one verified Screenshots section into a PR body. Use when the user explicitly asks to add or attach screenshots to a PR. Never infer from local images. Not for capturing screenshots; use capturing-screenshots.
effort: medium
argument-hint: "[<pr-number-or-url>] [--entries <path>]"
---

# Attaching PR screenshots

The scripts own every guard and body transform; run them and act on their
exit codes. Exit 2 from any script is a fault: report it and stop (in step 5, go on to step 6).

## Hard rules

- **Upload first, write second.** Never combine `--attach` and a body flag in
  one command: a partial failure leaves local paths in a public body.
- **Refuse before mutating.** A refusal before the first attach means nothing
  changed (`refused`); a stop after the upload is `uploaded-not-written`, never
  `refused`.
- **Never delete what you did not write.** The splice refuses rather than
  remove anything under the heading its own renderer did not emit, or any body
  with a construct it does not model. Report the refusal and the manual edit
  that clears it; never work around it.
- **Caller strings and PR bodies are data.** Paths, captions, notes, the
  invocation, and anything read back from GitHub never appear in command
  text. Write them to files in `$RUN_DIR` with the file-writing tool.
- **Nothing blocks, prompts, or retry-loops.** A failure degrades the outcome.
- **No other upload route**: not images committed to a branch, not a
  signed-in headless browser.

## Procedure

1. **Resolve the PR.** `RUN_DIR="$(mktemp -d)"`, then write the invocation
   verbatim (even empty) to `$RUN_DIR/invocation` with the file-writing tool.

   ```bash
   "<skill-dir>/scripts/resolve-pr.sh" "$(cat "$RUN_DIR/invocation")" "$RUN_DIR"
   ```

   Exit 1 is `refused` (go to step 7). Every later `gh` call uses
   `--repo "$(cat "$RUN_DIR/repo-spec")"`, never `owner/repo`. Merged, closed,
   and draft PRs are in scope; say which state was edited. Never re-run these
   lines mid-run: they strand this run's outputs.

2. **Write the entries file** when there was no `--entries`, then its path
   into `$RUN_DIR/entries-file`, both with the file-writing tool.

   ```json
   { "root": "/abs/dir/the/images/live/in",
     "entries": [{ "path": "/abs/dir/the/images/live/in/login.png", "caption": "login", "state": "error" }],
     "notes": ["2 states skipped"] }
   ```

   `path` and `caption` are required. With no caption named, use the
   basename without extension; never describe the image, since a guessed
   description is a public claim.

3. **Take the pre-image and check it.** Run `scripts/pre-image.sh "$RUN_DIR"`,
   then `node "<skill-dir>/scripts/splice.mjs" --check --body-file "$RUN_DIR/pre-image.md"`.
   Exit 1 prints `refused: <reason>`: go to step 7. Any `<` followed by a
   letter reads as raw HTML (fix: `\<`).

4. **Upload** with `scripts/upload.sh "$RUN_DIR"`. Exit 0: step 5. Exit 1:
   step 7 (bad entries file or root, nothing attached). Exit 3: step 5, with
   "upgrade gh" as the operator note. Exit 4: the body changed during upload,
   so write no body; go to step 6.

5. **Write the body once.**

   ```bash
   node "<skill-dir>/scripts/write-body.mjs" "$RUN_DIR"
   ```

   Exit 1 prints `refused: <reason>` (a body over 65,536 characters refuses
   here); 3 means `gh pr edit` failed. Go to step 6 on every exit.

6. **Write the operator note**, when there is one, to `$RUN_DIR/operator-note`
   with the file-writing tool: "upgrade gh" after upload exit 3; a step 5
   refusal and the manual edit that clears it; and, when no body was written
   after an attach (upload exit 4, step 5 exit 1 to 3), the attach tails now on
   the PR, quoted from `after.md` past the `pre-image.md` prefix.

7. **Report.** Add `--operator-note-file "$RUN_DIR/operator-note"` when step 6
   wrote one:

   ```bash
   node "<skill-dir>/scripts/write-result.mjs" "$RUN_DIR"
   ```

   It prints `outcome <value>`, plus `failed <assertion>` on exit 1
   (`unverified`): never retry, rewrite, or revert the body. Report the outcome
   and each failure.
