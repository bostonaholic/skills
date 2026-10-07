---
name: attaching-pr-screenshots
description: Uploads local images through GitHub's attachment pipeline and writes one verified Screenshots section into a PR body. Use when the user explicitly asks to add or attach screenshots to a PR. Never infer from local images. Not for capturing screenshots; use capturing-screenshots.
effort: medium
argument-hint: "[<pr-number-or-url>] [--entries <path>]"
---

# attaching-pr-screenshots

Attach local image files to a pull request through GitHub's own attachment
pipeline, harvest the URLs it resolves, and write one `## Screenshots` section
into that PR's body. A calling skill decides which entries qualify and passes
them with `--entries`.

Every step with a loop, a branch, or a value a later step needs is a committed
script under `scripts/`, run with its arguments and read by its exit code.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## Hard rules

- **Upload first, write second.** Never combine an attach flag and a body flag
  in one command.
- **One body write per PR**, computed by `scripts/splice.mjs` from the
  pre-image taken before the first attach. That write also clears the tails
  the attach step appended.
- **Refuse before mutating.** Every check that can run before the first attach
  does, so a refusal means nothing changed. A check that can only run after
  the upload lands on `uploaded-not-written`, never on `refused`.
- **Caller strings are data.** Paths, captions, notes, and failure reasons are
  normalized once
  ([input and result](references/input-and-result.md)) and reach commands only
  as quoted expansions or files, per the
  [external data rules](shared/external-data.md).
- **Nothing blocks, prompts, or retry-loops.** A capability gap, a failed
  entry, or a failed read-back degrades the result and says so, per the
  [focused work rules](shared/focused-work.md) and
  [verified results rules](shared/verified-results.md).
- **Never delete what you did not write.** A replace deletes only the shapes
  this skill's renderer emits; anything else refuses with its line number
  ([section shape](references/upload-and-body-edit.md#the-sections-markdown-shape)).
- **Nothing leaves the declared root, and only images upload.** Every entry
  resolves inside the entries file's absolute `root`, and `file -b --mime-type`
  must report `image/*`.

Before improvising any other upload route, read
[rejected approaches](references/rejected-approaches.md).

## Procedure

Copy this checklist and check off each step:

```text
- [ ] 1. Check required tools
- [ ] 2. Resolve the PR
- [ ] 3. Write the entries file (when no --entries was given)
- [ ] 4. Take the pre-image and run the body checks
- [ ] 5. Validate entries, check the attach capability, and upload
- [ ] 6. Render the section, splice, and write once
- [ ] 7. Verify the rendered body
- [ ] 8. Write result.json and report
```

1. **Check required tools.** Run `command -v gh jq file node` and
   `gh auth status`. When one is missing or unauthenticated, stop and name it.
   The scripts also exit 2 naming a missing tool.
2. **Resolve the PR.** Run `scripts/resolve-pr.sh` as shown in
   [input and result](references/input-and-result.md).
3. **Write the entries file** when the invocation carried no `--entries`, per
   [input and result](references/input-and-result.md).
4. **Take the pre-image.** Run `scripts/pre-image.sh`, then
   `scripts/splice.mjs --check`, per
   [upload and body edit](references/upload-and-body-edit.md).
5. **Upload.** Run `scripts/upload.sh`, per
   [upload and body edit](references/upload-and-body-edit.md).
6. **Splice and write.** Render the section, run `scripts/splice.mjs`, and
   write the body once, per
   [upload and body edit](references/upload-and-body-edit.md).
7. **Verify.** Run the read-back in [verify](references/verify.md).
8. **Report.** Write `result.json` and restate it, per
   [the result](references/input-and-result.md#the-result).

Step 7 runs in a subagent per the
[step delegation rules](shared/step-delegation.md). The other steps stay in
this session: each is one or two script calls or writes `$RUN_DIR` or the PR.

Track progress per the [execution rules](shared/execution.md).
