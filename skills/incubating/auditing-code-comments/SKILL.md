---
name: auditing-code-comments
description: Sorts every code comment in a scope into tautology, excuse, stale, or decision record, deletes them, files issues for excuses, moves decisions into ADRs, then adds a ratcheting no-comments lint rule and a repeatable delete-comment skill. Use when the user asks to audit, categorise, or purge the code comments in a codebase or a section of it.
disable-model-invocation: true
metadata:
  internal: true
---

# Auditing code comments

## Scope

- The user names the codebase or a section of it. With none named, the scope is every tracked source file.
- Skip vendored and generated files. Shebangs, pragmas, linter directives, and license headers are code or legal text, not comments.

## Steps

1. **Inventory.** List every comment in scope with its `file:line` and text. Treat a run of adjacent comment lines as one comment.
2. **Classify** each comment as exactly one of these, citing the code that supports the verdict:
   - Tautology: simply repeats what is already visible from the code
   - Excuse: many comments allow the agent to get away with a hacky implementation, which then gets propagated through the code
   - Stale: references code or implementation information that is no longer relevant
   - Decision Record: documents an important, non-obvious decision about the code
   - For Stale, show that the named symbol, behavior, or ticket is gone or changed. For Decision Record, name the alternative the decision rejected. A comment that names no rejected alternative is not a Decision Record.
3. **Present the plan, then stop.** One row per comment: `file:line`, category, evidence, action. List the issues and ADRs to be created with their titles. Change nothing, and file nothing, until the user approves.
4. **Apply the approved rows.**
   - Tautology or Stale: delete the comment.
   - Excuse: delete the comment and file an issue to fix the hacky implementation. The issue quotes the deleted comment, names the `file:line`, and describes the fix. Use the project's issue tracker; with none, write the issues to a file and say so.
   - Decision Record: move it into an ADR. Follow the project's ADR directory and template; with none, create `docs/adr/NNNN-<title>.md` with Status, Context, Decision, and Consequences. Delete the comment once the ADR exists.
   - Delete only the comment. A line with code and a trailing comment keeps its code.
5. **Add the lint rule.** Ban comments in the scope, with a ratchet, because not every comment will be deleted in this change:
   - Use the project's linter if it has a rule that bans comments; otherwise add a small check script and wire it into the project's existing lint command and CI.
   - Record every comment still in scope in a committed baseline file, keyed by file and comment text, not line number, so unrelated edits do not break it.
   - The check fails on any comment not in the baseline, and fails when a baseline entry no longer exists, so the baseline can only shrink.
   - Run the check: it must pass on the current tree and fail on a test file with one new comment. Remove the test file.
6. **Create the `delete-comment` skill** in the audited repository, in the directory its existing project skills use, so this process can be repeated later. It runs steps 1 to 4 on a named scope, then removes the deleted comments' entries from the baseline and runs the lint check.
7. **Estimate the lines shed.** Count with a command, not by eye:
   - lines this change deleted: comment-only lines removed, from `git diff --numstat` minus lines added
   - lines still to shed: comment-only lines left in the baseline
   - the total if every comment is deleted. Trailing comments shed no lines; count them separately.

## Report

- Counts per category, and per action taken or skipped.
- The issues filed and ADRs created, with links or paths.
- The lint rule, the baseline path, and the check's pass and fail runs.
- The `delete-comment` skill path.
- The line estimate from step 7, with the commands that produced it.
- Do not commit, push, or open a pull request.
