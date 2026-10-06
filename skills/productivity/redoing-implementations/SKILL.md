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
   is better. Wait for approval.

5. **Record the baseline**: List the checks the current implementation passes
   (tests, linters, type checks, and any manual checks from the conversation),
   run them, and note each result.

6. **Save the previous attempt**: List the files the attempt touched, then save
   them before changing anything, and tell the user where they are:
   - Committed part: point a branch at it, `git branch redo-previous-<topic>`.
   - Uncommitted part: write `git diff HEAD -- <touched files>` to
     `<out>/previous-attempt.patch` in a scratch directory outside the working
     tree, and copy any new untracked files it created into `<out>/`.

7. **Reset only the touched files**: Restore each file the attempt modified to
   its version from before the attempt and delete the files it created. Never
   reset or clean the whole working tree; other work stays as it is.

8. **Implement cleanly**: Write the new design from scratch rather than
   patching. Carry forward no unnecessary abstractions, workarounds, or dead
   code from the previous attempt.

9. **Verify against the baseline**: Run the same checks as step 5. Fix and
   re-run until every check the previous attempt passed passes again. Report
   each result that changed.
