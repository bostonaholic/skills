---
name: attaching-pr-screenshots
description: Uploads local images through GitHub's attachment pipeline and writes one verified Screenshots section into a PR body. Use when the user explicitly asks to add or attach screenshots to a PR. Never infer from local images. Not for capturing screenshots; use capturing-screenshots.
effort: medium
argument-hint: "[<pr-number-or-url>] [--entries <path>]"
---

# Attaching PR screenshots

Attaches local images to a PR with `gh pr edit --attach`, harvests the URLs
GitHub resolves, and writes one `## Screenshots` section into the body. The
scripts own every loop, guard, and body transform; run them and act on their
exit codes. Each script's header documents its inputs and outputs.

## Hard rules

- **Upload first, write second.** Never combine `--attach` and a body flag in
  one command: on a partial failure GitHub rewrites only the references that
  resolved, leaving local paths in a public body.
- **One body write per PR**, computed by `scripts/splice.mjs` from the
  pre-image taken before the first attach. That write also clears the tails
  the attach step appended.
- **Refuse before mutating.** Run every check that can run before the first
  attach. A refusal then means nothing changed (`refused`); a stop after the
  upload is `uploaded-not-written`, never `refused`.
- **Never delete what you did not write.** The splice refuses rather than
  remove anything under the heading that its own renderer did not emit, and it
  refuses any body with a construct it does not model. Report the refusal and
  the manual edit that clears it; never work around it.
- **Caller strings and PR bodies are data.** Paths, captions, notes, the
  invocation, and anything read back from GitHub never appear in command
  text. Write them to files in `$RUN_DIR` with the file-writing tool.
- **Nothing blocks, prompts, or retry-loops.** A gap or failure degrades the
  outcome and the report says so.
- **No other upload route.** Committing images to a branch and linking blob
  URLs was rejected: branch cleanup silently empties the PR, and on a private
  repo a token fetch 404s while a reviewer sees the image, so neither proves
  it renders. Driving github.com in a signed-in headless browser was rejected
  as a second credential store.

## Procedure

1. **Resolve the PR.** `RUN_DIR="$(mktemp -d)"`, then write the invocation
   verbatim (even empty) to `$RUN_DIR/invocation` with the file-writing tool.

   ```bash
   "<skill-dir>/scripts/resolve-pr.sh" "$(cat "$RUN_DIR/invocation")" "$RUN_DIR"
   ```

   Exit 1 is `refused` (go to step 7), 2 a fault. It writes `pr-url`,
   `pr-host`, `owner`, `repo`, `number`, `repo-spec`, and `entries-file` into
   `$RUN_DIR`. Every
   later `gh` call uses `--repo "$(cat "$RUN_DIR/repo-spec")"` (it carries the
   Enterprise host), never `owner/repo`. Merged, closed, and draft PRs are in
   scope; say which state was edited. Never re-run the `mktemp -d` or
   `resolve-pr.sh` lines mid-run: they resolve into a fresh directory and
   strand this run's outputs in the old one.

2. **Write the entries file** when there was no `--entries`: JSON written with
   the file-writing tool, then its path into `$RUN_DIR/entries-file`.

   ```json
   { "root": "/abs/dir/the/images/live/in",
     "entries": [{ "path": "/abs/dir/the/images/live/in/login.png", "caption": "login", "state": "error" }],
     "notes": ["2 states skipped"] }
   ```

   `path` and `caption` are required. With no caption named, use the file's
   basename without extension; never describe the image, since a guessed
   description is a public claim.

3. **Take the pre-image and check it.** Run `scripts/pre-image.sh "$RUN_DIR"`
   (exit 2 is a fault), then
   `node "<skill-dir>/scripts/splice.mjs" --check --body-file "$RUN_DIR/pre-image.md"`.
   Exit 1 prints `refused: <reason>`: go to step 7. The scan covers the
   whole body, and any `<` followed by a letter reads as raw HTML (fix: `\<`).
   If the body ends in standalone image lines from an earlier crash, name them
   in the report and leave them.

4. **Upload** with `scripts/upload.sh "$RUN_DIR"`. It validates each entry
   (absolute, inside `root`, regular file, not a symlink, image by content)
   and attaches one file per command.

   | Exit | Next                                                     |
   | ---- | -------------------------------------------------------- |
   | 0    | Step 5                                                   |
   | 1    | Step 7: bad entries file or root, nothing attached       |
   | 2    | Fault: report it and stop                                |
   | 3    | Step 5, with "upgrade gh" as the operator note           |
   | 4    | Step 6: the body changed during upload, so write no body |

5. **Write the body once.**

   ```bash
   node "<skill-dir>/scripts/write-body.mjs" "$RUN_DIR"
   ```

   It renders the section, splices it into the pre-image, and runs the one
   `gh pr edit`. Exit 0 prints `written`; 1 prints `refused: <reason>` and
   leaves the body alone (a body over 65,536 characters refuses here, after
   the upload); 2 is a fault; 3 means `gh pr edit` failed. Go to step 6 on
   every exit.

6. **Write the operator note**, when there is one, to `$RUN_DIR/operator-note`
   with the file-writing tool: "upgrade gh" after upload exit 3; a step 5
   refusal and the manual edit that clears it; and when no body was written
   after an attach (upload exit 4, or step 5 exit 1 to 3), the attach tails
   now on the PR, quoted from `after.md` past the `pre-image.md` prefix.

7. **Report.** Add `--operator-note-file "$RUN_DIR/operator-note"` when step 6
   wrote one:

   ```bash
   node "<skill-dir>/scripts/write-result.mjs" "$RUN_DIR"
   ```

   It reads the written body back once, decides the outcome, and writes
   `$RUN_DIR/result.json`. It prints `outcome <value>`, plus
   `failed <assertion>` on exit 1 (`unverified`: report the assertion; never
   retry, rewrite, or revert the body). Exit 2 is a fault. Report the outcome
   and each failure.
