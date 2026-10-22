# Settling items

`scripts/settle-item.mjs` ends with one of these exits. Exit 0 (`verified`) is
the only done.

- Exit 1 names the failed step: report it, fix the cause, and rerun (completed
  writes are skipped).
- Exit 2 is a usage fault; nothing was written.
- Any other exit: stop and report its stderr.
- A `reaction-failed` line is a warning on the item's report line, never an
  exclusion.
