# Per-PR procedure

You own one PR: `<n>`, `<branch>`, `<base>`, and `<pre_oid>` (the remote OID
before the rebase), with the run directory `<run>` and the skill directory
`<skill-dir>`. Act only inside your worktree through `git -C <worktree>`; run
the scripts from the main checkout. Never fetch.

1. **Prepare the worktree** with `"<skill-dir>/scripts/prepare-worktree.sh" <branch>`.
   Keep its `WORKTREE_PATH`, `CREATED`, and `BRANCH_CREATED` for cleanup. Exit
   3 or 4 (branch missing, or stale, ahead, or dirty): record `skipped` with
   its stderr reason and stop. Any other failure: record `error` and stop
   without cleanup, since it printed nothing to clean up with.

2. **Rebase** with `git -C <worktree> rebase origin/<base>`. Keep its output:
   step 4 needs any `skipped previously applied commit` and
   `dropping ... -- patch contents already upstream` lines. Resolve conflicts
   by the [conflict resolution](references/conflict-resolution.md) rules and continue
   with `GIT_EDITOR=true git -C <worktree> rebase --continue`; on a stop
   condition, `rebase --abort` and record `conflicts-flagged`. A non-zero exit
   with no conflicted file (`diff --name-only --diff-filter=U` is empty) is
   another failure, such as an untracked file in the way: abort and record
   `error` with git's message.

   `HEAD` equal to `<pre_oid>` afterwards means `already-up-to-date`. No commits
   left in `origin/<base>..HEAD` means `skipped`, "emptied by base; suggest
   closing". Neither pushes.

3. **Verify** only when conflicts were resolved and a fast check exists (a
   typecheck, the linter on changed files, or the most relevant test), not the
   full suite. Fold each fix into the replayed commit it corrects
   (`commit --amend --no-edit` for the tip, otherwise `commit --fixup=<commit>`
   then `GIT_SEQUENCE_EDITOR=true git -C <worktree> rebase -i --autosquash origin/<base>`),
   so step 4 sees no new commit. After 3 failed fixes the resolution needs a
   human: record `conflicts-flagged` with `verify: failed(<reason>)`. A failure
   unrelated to the resolution is noted, not fixed.

4. **Prove no commit was dropped** before pushing:

   ```bash
   git -C <worktree> range-diff origin/<base> <pre_oid> HEAD
   ```

   Every old commit must pair with a new one (`=` or `!`). An old-only commit
   (`< -:`) is acceptable only when step 2's output named it as already in the
   base; any other means the rebase dropped PR work, so record
   `conflicts-flagged` and do not push. A new-only commit (`-: >`) should not
   exist: record `error` and do not push.

5. **Push** with `git -C <worktree> push --force-with-lease=<branch>:<pre_oid> origin <branch>`.
   On any rejection, never retry with force: record `push-rejected` with git's
   message.

6. **Persist the result, always,** including after a skip, flag, or failure,
   and before cleanup. The file is the system of record; reconcile reads it.
   Keep the note to plain words and paths, with no quotes, `$`, or backticks:

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

7. **Clean up** with
   `"<skill-dir>/scripts/cleanup-worktree.sh" <worktree> <branch> <CREATED> <BRANCH_CREATED>`,
   which removes only what step 1 created. If it fails, rewrite the result
   file with its error appended to `note`. Return a one-line summary.
