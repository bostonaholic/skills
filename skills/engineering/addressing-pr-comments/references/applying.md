# Applying

Run these steps per A or B item, or once per group below, before the diff,
stage, commit, and push in `SKILL.md`. An image ask's A edits no file, so it
skips these steps and the diff, stage, commit, and push.

1. Before the pass's first item, delete every throwaway test this pass wrote,
   then record the untracked (`??`) paths that
   `git status --porcelain=v1 --untracked-files=all` lists: the baseline.
2. **Clean-checkout check:** the same `git status` lists only baseline paths,
   no file the item creates exists, and the item writes no baseline path.
3. **Red run:** if the item has a reproduction (the test verification named,
   or its throwaway test written again as a new file), run it and see it fail.
4. Edit. The touched files are the paths this edit and any step 5 edit change.
5. **Fix checks**, in order: the reproduction, the tests covering the touched
   files, then the formatter and linter in report-only mode, each on the
   touched files it covers. Each result goes on the item's report line.
   - A result is `passed`, `failed`, `timed out` (its process group killed
     after 120 seconds with no output, which marks a hang; a slow check that
     keeps printing never times out), or `not run (<reason>)`.
   - `not run` only when the item has no reproduction, HEAD lacks the check,
     its tool, or a report-only mode, or the tool covers no touched file; any
     other non-zero exit after the edit is `failed`.
   - After a failure or timeout, make at most one more edit inside the item's
     scope, then rerun every fix check. Never rerun a check with no edit.
6. Delete any throwaway test.
7. **Staging check:** the same `git status` lists only the touched files and
   baseline paths, and no touched file is a baseline path.

Items that share one concern (the same defect or the same requested change)
take one edit and one commit. Form groups before the pass's first item. Each
item still qualifies on its own, and one throwaway test may serve as the
red-green proof for items that make the same claim. The group passes or stops
as one unit.

An item stops, as could-not-apply, at the first of these. Its block's
Confidence line names the stop and, where listed, its detail:

- The clean-checkout check finds a path outside the baseline: that path, and
  that the user commits, stashes, or discards it, then reruns. When an earlier
  item's leftover edit is that path, name the earlier item in place of the
  path.
- A file the item creates already exists, or the item writes a baseline path:
  that path.
- The reproduction passes before the edit.
- The edit changes no path (the change is already in place).
- A fix check's last result is `failed` or `timed out`, whether or not the
  extra edit was made: the check, its result, and its first error line.
- The staging check lists a path outside the touched files and baseline
  paths, or a touched file is a baseline path: each such path.
- `git commit` fails: its first error line.

An exclusion found during the edit also stops the item. A stopped item skips
every later step, through the push. It deletes any throwaway test and keeps
its edit for the user, and nothing later restores the edit. Its block's
Confidence line also names each path its edit or its checks left.
