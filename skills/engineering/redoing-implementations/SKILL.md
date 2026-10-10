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
4. **Save, then reset only the attempt's files.** Run every command from the
   repository root, with `<files>` the whole step 2 list,
   `<tracked files>` its tracked group, and `<out>` a new scratch directory
   outside the working tree (`mktemp -d`).
   - Record `<base>`, the commit the attempt started from: `HEAD` when the
     attempt committed nothing, otherwise the parent of its first commit.
     On a branch with no commits (`git rev-parse --verify HEAD` fails), use
     the empty tree, `git hash-object -t tree /dev/null`, as `<base>` and in
     place of `HEAD` below.
   - Committed part, when there is one: `git branch redo-previous-<topic>`.
   - Uncommitted changes to tracked files, staged or not:
     `git diff --binary --default-prefix HEAD -- <files> > <out>/previous-attempt.patch`.
     `--binary` keeps binary files, and `--default-prefix` overrides a
     `diff.noprefix` setting that would make `git apply` misread the paths.
   - New untracked files, with their directories:
     `git ls-files -z --others -- <files> | tar --null -T - -cf <out>/untracked.tar`.

   Reset nothing until both saves check out:
   `git apply -R --check <out>/previous-attempt.patch` passes, and
   `tar -tf <out>/untracked.tar` lists every new file. Skip a save and its
   check only when the attempt has nothing of that kind. If a check fails,
   stop and report it.

   Then run
   `git restore --source=<base> --staged --worktree -- <tracked files>`,
   which also removes files the attempt added. Give it only tracked files:
   it refuses the whole list if one path is untracked. Delete the new
   untracked files with
   `git ls-files -z --others -- <files> | xargs -0 rm -f --`. Never reset or
   clean the whole working tree; other work stays as it is.

   Tell the user where the saves are and how to bring the attempt back,
   from the repository root:
   `git restore --source=redo-previous-<topic> --staged --worktree -- <tracked files>`
   when there is a committed part, then
   `git apply <out>/previous-attempt.patch` and `tar -xf <out>/untracked.tar`.

5. **Implement cleanly.** Write the new design from scratch rather than
   patching, carrying forward no abstraction, workaround, or dead code from
   the previous attempt.
6. **Re-pass the baseline.** Run the step 3 checks. Fix and re-run until
   every check the previous attempt passed passes again, and report each
   result that changed.
