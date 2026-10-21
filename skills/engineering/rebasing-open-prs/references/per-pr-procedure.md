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

2. **Rebase** with `git -C <worktree> rebase origin/<base>`. Resolve conflicts
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

4. **Prove no commit was dropped** before pushing: run
   `"<skill-dir>/scripts/check-range-diff.sh" <worktree> <base> <pre_oid>`.
   Exit 0: push. Exit 3 (a `DROPPED` line): the rebase lost PR work, so record
   `conflicts-flagged` naming the commit, and do not push. Exit 4 (a `NEW`
   line): record `error` and do not push. Any other exit: record `error` with
   its stderr.

5. **Push** with `git -C <worktree> push --force-with-lease=<branch>:<pre_oid> origin <branch>`.
   On any rejection, never retry with force: record `push-rejected` with git's
   message.

6. **Persist the result, always,** including after a skip, flag, or failure,
   and before cleanup. The file is the system of record; reconcile reads it.
   Run
   `"<skill-dir>/scripts/write-result.sh" <run> <n> <branch> <base> <status> <conflicts> <verify> <created> <worktree>`
   with the one-line note on stdin through a quoted heredoc (`<<'EOF'`), so
   any text passes unchanged. Pass `none` for `<created>` and `<worktree>`
   when step 1 printed nothing. Exit 2 names the bad value: fix it and re-run.
   Exit 127 means git or jq is missing. Any other exit: stop and report its
   stderr.

7. **Clean up** with
   `"<skill-dir>/scripts/cleanup-worktree.sh" <worktree> <branch> <CREATED> <BRANCH_CREATED>`,
   which removes only what step 1 created. Exit 2 is a usage error, or a run
   from inside `<worktree>`, which needs a re-run from the main checkout. Exit
   1 means a removal failed, with git's message on stderr. If it fails, re-run
   `write-result.sh` with its error appended to the note. Return a one-line
   summary.
