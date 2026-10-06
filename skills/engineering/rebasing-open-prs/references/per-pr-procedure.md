# Per-PR procedure

## Contents

- Steps: 1 prepare the worktree, 2 rebase, 3 check for no-ops, 4 verify,
  5 compare before pushing, 6 push, 7 persist the result, 8 clean up, 9 return

## Steps

You own one PR: `<n>`, `<branch>`, `<base>`, and `<pre_oid>` (the remote OID
before the rebase), with the shared run directory `<run>` and the skill
directory `<skill-dir>`. Act only inside your worktree through
`git -C <worktree>`. Run the scripts from the main checkout.

1. **Prepare the worktree.**

   ```bash
   "<skill-dir>/scripts/prepare-worktree.sh" <branch>
   ```

   It prints `WORKTREE_PATH` (call it `<worktree>`), `CREATED`,
   `BRANCH_CREATED`, and `BRANCH`. Exit 3 or 4 means the branch is missing or
   unsafe to reuse (stale, carrying unpushed commits, or dirty): record
   `skipped` with the script's stderr reason as the note (step 7) and stop;
   there is nothing to clean up. Any other non-zero exit means the script
   failed: record `error` with its stderr message as the note (step 7) and
   stop without cleanup, since it printed no values to clean up with.

2. **Rebase.**

   ```bash
   git -C <worktree> rebase origin/<base>
   ```

   Keep its output for step 5, which needs any
   `skipped previously applied commit <sha>` and
   `dropping <sha> <subject> -- patch contents already upstream` lines.

   On a conflict, read
   [conflict resolution](references/conflict-resolution.md), then loop: list
   conflicted files with `git -C <worktree> diff --name-only --diff-filter=U`,
   resolve each, `git -C <worktree> add <file>`, and continue with
   `GIT_EDITOR=true git -C <worktree> rebase --continue`, until the rebase
   completes or a stop condition applies. On a stop condition, run
   `git -C <worktree> rebase --abort` and record `conflicts-flagged`.

   When `rebase` or `rebase --continue` exits non-zero and that diff lists no
   conflicted file, the rebase failed for another reason, such as an untracked
   file in the way. Run `git -C <worktree> rebase --abort` (it fails harmlessly
   when no rebase is in progress), record `error` with git's message, and skip
   to step 7.

3. **Check for no-ops.** `git -C <worktree> rev-parse HEAD` equal to
   `<pre_oid>` means it was already up to date: record `already-up-to-date`
   and skip to step 7. `git -C <worktree> rev-list --count origin/<base>..HEAD`
   of `0` means the rebase emptied the PR: record `skipped` with the note
   "emptied by base; suggest closing" and skip to step 7.

4. **Verify** only when conflicts were resolved and a fast check exists: a
   typecheck or compile, the linter on changed files, or the single most
   relevant test. Do not run full slow suites. If a check fails because of the
   resolution, fix it and re-run that check. Fold each fix into the replayed
   commit it corrects, so step 5 sees no new commit:
   `git -C <worktree> commit --amend --no-edit` for the tip commit, otherwise
   `git -C <worktree> commit --fixup=<commit>` followed by
   `GIT_SEQUENCE_EDITOR=true git -C <worktree> rebase -i --autosquash origin/<base>`.
   After 3 failed fixes, which means the resolution needs a human, record
   `conflicts-flagged` with `verify: failed(<reason>)` and do not push. A
   failure unrelated to the resolution is noted, not fixed.

5. **Compare before pushing.**

   ```bash
   git -C <worktree> range-diff origin/<base> <pre_oid> HEAD
   ```

   Every old commit must pair with a new one (`=` unchanged or `!` changed). An
   old-only commit (`< -:`) is acceptable only when step 2's output named it as
   already in the base. Any other old-only commit means the rebase dropped PR
   work: do not push; record `conflicts-flagged` with that note. A new-only
   commit (`-: >`) should not exist, since step 1 refuses a branch with
   unpushed commits and step 4 folds fixes into replayed commits: do not push;
   record `error` with that note.

6. **Push** with the exact lease:

   ```bash
   git -C <worktree> push --force-with-lease=<branch>:<pre_oid> origin <branch>
   ```

   On any rejection (stale lease, protected branch, permission denied), never
   retry with force: record `push-rejected` with git's message.

7. **Persist the result, always,** including after a skip, flag, or failure,
   and before cleanup. The file is the system of record; your returned message
   is a convenience. Keep the note to plain words and paths, with no quotes,
   `$`, or backticks:

   ```bash
   jq -n --argjson pr <n> --arg branch '<branch>' --arg base '<base>' \
     --arg status '<pushed|already-up-to-date|conflicts-flagged|push-rejected|skipped|error>' \
     --argjson conflicts <files-resolved-count> \
     --arg verify '<passed|skipped|failed(reason)>' --arg created '<CREATED, or none if step 1 printed none>' \
     --arg head "$(git -C <worktree> rev-parse HEAD 2>/dev/null || echo unknown)" \
     --arg note '<one line>' \
     '{pr:$pr, branch:$branch, base:$base, status:$status, conflicts:$conflicts, verify:$verify,
       worktree:(if $created == "true" then "created" elif $created == "false" then "reused" else "none" end),
       head:$head, note:$note}' \
     >"<run>/<n>.json"
   ```

8. **Clean up** from the main checkout, passing the values step 1 printed:

   ```bash
   "<skill-dir>/scripts/cleanup-worktree.sh" <worktree> <branch> <CREATED> <BRANCH_CREATED>
   ```

   It removes only what step 1 created. If it exits non-zero, rewrite the
   result file with its error appended to `note`.

9. **Return** a one-line summary: PR, status, conflicts, verify, note.
