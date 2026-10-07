---
name: redoing-implementations
description: Rebuilds the current implementation from scratch as the simplest design that satisfies what was learned, after the user approves the design. Use when the user explicitly asks to redo the work, start over, scrap the approach, or rewrite it more simply. Never infer from a failing or complex implementation.
disable-model-invocation: true
---

# Elegant Redo

After working through a problem and learning its constraints and edge cases,
step back and reimplement it from scratch with the simplest solution that meets
them.

## Steps

Steps 5 and 8 run in subagents under the
[step delegation rules](shared/step-delegation.md); the other steps stay
inline.

1. **Synthesize what was learned**: Review the conversation. Identify the core
   problem, the constraints and edge cases discovered along the way, what made
   the current approach complex or unsatisfying, and the insights that only
   became clear after working through it.

2. **Identify the essential complexity**: Separate what is truly necessary from
   accidental complexity. Ask: "What is the minimum design a senior engineer
   with full context would accept?"

3. **Design the new solution, or stop**: If the current implementation already
   is that minimum design, say so and stop. Do not rewrite for the sake of
   rewriting. Otherwise describe the new approach in 3-5 sentences. It should
   have fewer moving parts and less indirection, and take the shortest path
   from input to output.

4. **Confirm with the user**: Present the new design, what changes, and why it
   is better. List the files the attempt touched in two groups, the tracked
   files it changed or committed and the untracked files it created: step 7
   resets or deletes exactly these. Wait for approval.

5. **Record the baseline**: List the checks the current implementation passes
   (tests, linters, type checks, and any manual checks from the conversation),
   and note each result. Run them in one read-only `sonnet` subagent given the
   repository root and each check's command or manual procedure; it edits no
   file and returns one line per check with its result.

6. **Save the previous attempt**: Save it before changing anything. Run every
   command from the repository root, with `<files>` the whole step 4 list,
   `<tracked files>` its tracked group, and `<out>` a new scratch directory
   outside the working tree (`mktemp -d`):
   - Record `<base>`, the commit the attempt started from: `HEAD` when the
     attempt committed nothing, otherwise the parent of its first commit.
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

   Tell the user where the saves are and how to bring the attempt back, from
   the repository root:
   `git restore --source=redo-previous-<topic> --staged --worktree -- <tracked files>`
   when there is a committed part, then
   `git apply <out>/previous-attempt.patch` and `tar -xf <out>/untracked.tar`.

7. **Reset only the attempt's files**: From the repository root, run
   `git restore --source=<base> --staged --worktree -- <tracked files>`, which
   also removes files the attempt added. Give it only tracked files: it refuses
   the whole list if one path is untracked. Then delete the new untracked files
   with `git ls-files -z --others -- <files> | xargs -0 rm -f --`. Never reset
   or clean the whole working tree; other work stays as it is.

8. **Implement cleanly**: Write the new design from scratch rather than
   patching. Carry forward no unnecessary abstractions, workarounds, or dead
   code from the previous attempt. Run this step in one writer subagent given
   the step 1 synthesis, the approved step 3 design, and the step 5 checks; it
   writes only inside the repository, commits nothing, and returns the paths it
   created or changed plus any constraint it could not meet.

9. **Verify against the baseline**: Run the same checks as step 5. Fix and
   re-run until every check the previous attempt passed passes again. Report
   each result that changed.
