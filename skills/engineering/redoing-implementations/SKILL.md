---
name: redoing-implementations
description: Rebuilds the current implementation from scratch as the simplest design that satisfies what was learned, after the user approves the design. Use when the user explicitly asks to redo the work, start over, scrap the approach, or rewrite it more simply. Never infer from a failing or complex implementation.
disable-model-invocation: true
---

# Elegant Redo

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
