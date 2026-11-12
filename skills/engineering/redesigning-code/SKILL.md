---
name: redesigning-code
description: Redesigns code from first principles after the user approves the design. Redo mode rebuilds the current attempt from scratch as the simplest design that fits what was learned. Redesign mode reworks an existing design as if a new requirement had been a founding assumption, delivers it in working increments, and updates every reference. Use when the user explicitly asks to redo the work, start over, scrap the approach, or rewrite it more simply, or to redesign for a requirement or from first principles. Never infer from a failing or complex implementation or a feature request. Not for a whole-codebase cleanup; use improving-codebases.
disable-model-invocation: true
argument-hint: "[redo | redesign <requirement>]"
---

# Redesigning code

## Modes

The user may name a mode as the first word of the request. Otherwise pick by what the request asks for:

- **Redo**: `redo`, or a request to redo the work, start over, scrap the
  approach, or rewrite it more simply. It rebuilds the session's attempt.
- **Redesign**: `redesign <requirement>`, or a request that names a new
  requirement for the design, or asks to redesign from first principles.
- When the request fits both modes or neither, or names Redesign with no
  requirement, ask which one in one line and edit nothing until the user answers.

## Redo

After working through a problem and learning its constraints and edge cases,
reimplement it from scratch with the simplest design that meets them.

1. **Design, or stop.** From the conversation, separate the essential
   complexity (the constraints and edge cases discovered) from the
   accidental. If the current implementation is already the minimum design
   a senior engineer with full context would accept, say so and stop; never
   rewrite for its own sake. Otherwise describe the new approach in 3 to 5
   sentences: fewer moving parts, less indirection.
2. **Get approval.** Open the reply with the step 1 design as one
   paragraph of 3 to 5 sentences that holds only the design; count them
   before replying. After the paragraph, a list or code sketch gives what
   changes, why it is better, and every further detail (edge cases, line
   numbers, ordering). List the files the attempt touched in two groups:
   tracked files it changed or committed, and untracked files it created.
   Step 4 resets or deletes exactly these. Keep every touched file in one of
   the two groups; to propose keeping one out of the save and reset, ask
   after the lists. Wait for approval.
3. **Record the baseline.** Run every check the current implementation
   passes (tests, linters, type checks, manual checks from the conversation)
   and note each result.
4. **Save, then reset only the attempt's files.** From the repository root,
   run
   `scripts/save-and-reset-attempt.sh <base> <topic> <out> -- <files>`,
   with `<base>` the commit the attempt started from (`HEAD` when it
   committed nothing, otherwise the parent of its first commit), `<topic>` a
   short branch-name word for the work, `<out>` a new directory outside the
   working tree (`mktemp -d`), and `<files>` every file in the step 2 list.
   Never reset or clean the whole working tree; other work stays as it is.
   - Exit 0: tell the user the `branch=`, `patch=`, and `tar=` saves that
     are not `none`, and give the `restore=` commands, in order, as the way
     to bring the attempt back.
   - Exit 1: a save failed its check and nothing was reset. Stop and report
     the stderr.
   - Exit 2 or 3: fix the named argument or install the named tool, then
     rerun with a new `<out>`.
   - Exit 4: the saves are intact but the reset failed. Stop and report the
     stderr and `<out>`.

5. **Implement cleanly.** Write the new design from scratch rather than
   patching, carrying forward no abstraction, workaround, or dead code from
   the previous attempt.
6. **Re-pass the baseline.** Run the step 3 checks. Fix and re-run until
   every check the previous attempt passed passes again, and report each
   result that changed.

## Redesign

Do not bolt the new requirement onto the current design. Redesign as if it
had been a founding assumption, so the result reads as if it was always
built that way.

1. **Read the whole design.** Read every file the requirement touches and
   the files that depend on them, until you can state the current design's
   assumptions. Name the assumption the requirement breaks.
2. **Design from scratch.** Ask: if this were written today with the
   requirement known from day one, what would be built? Describe that target
   design, then the bolt-on alternative, and say what the bolt-on would leave
   behind (special cases, flags, adapters, names that no longer fit). If the
   target design is the current design plus a small addition, say so and make
   that change; never redesign for its own sake.
3. **Plan the increments.** Break the path to the target into steps that
   each leave the system working and its checks passing. Order them so no
   step needs a later one.
4. **Get approval.** Reply with the broken assumption, the target design,
   what the bolt-on would leave behind, and the increments. Wait for
   approval before editing.
5. **Deliver one increment at a time.** After each, run the project's
   checks and fix until they pass before starting the next.
6. **Propagate to every reference.** Search for the broken assumption by
   name and by idea: types, names, comments, docs, examples, tests,
   fixtures, config, and rationale or decision sections. Update each to the
   new design, so none still describes the old one. Report what you changed
   and any reference you left, with why.
