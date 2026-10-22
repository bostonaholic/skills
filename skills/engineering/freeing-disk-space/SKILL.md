---
name: freeing-disk-space
description: Finds what fills a developer machine's disk and frees space by clearing caches, build outputs, and other regenerable files, running each deletion only after approval and never emptying the Trash. Use when a disk is full or nearly full, the user is running out of disk space, builds or containers fail for lack of space, or the user asks for a disk cleanup plan, to free a target amount of space, or to clean up, reclaim space, or delete caches, build outputs, or the Trash to make room.
---

# Freeing disk space

Find where the space went, then remove only what a tool can recreate.

## Rules

- **Approval first.** Show the exact command and what it removes. Run nothing
  that deletes until the user approves that command.
- **The owning tool cleans its own files.** Prefer `brew cleanup`,
  `docker builder prune`, or `xcrun simctl delete unavailable` over `rm`.
- **Never propose user data.** Documents, photos, mail, device backups, source
  trees with uncommitted or unpushed work, container volumes, VM disks, and
  databases are reported with their size and left to the user.
- **Never empty the Trash.** Report its size and tell the user to empty it.
- **Keep pinned toolchain versions.** Before removing a toolchain version, run
  `scripts/list-pinned-versions.sh <workspace>` on each directory that holds
  the user's projects, and keep every version it prints. Exit 64 means the
  path is not a directory, and exit 69 means a required tool is missing:
  report its error.
- **Stop at the target.** The user's number, otherwise the target
  `scripts/measure-caches.sh` prints. Stop once it is met and say which
  approved rows you skipped.

## Find where the space went

- Run `scripts/measure-caches.sh` in the background; `du` can take minutes.
- It prints the volume line, with its target, then one row per known location.
- Take each row's class, recreated-by, command, and close-first as printed,
  filling any `<placeholder>`; report keep rows, never propose them.
- On exit 1 or 69, report the error and measure with `df -h` and `du -x` by
  hand. Exit 64 means an argument was given; run it with none.

Then descend with `du -x` from the home directory into trees the script did
not list, and check [cache locations](references/cache-locations.md) for each
toolchain present. Classify those yourself: a path does not say whether it
holds user data.

Compare what you found with the used space. When much is unexplained, size
the volume root, `/private/var` (or `/var`), other users' homes, and local
Time Machine snapshots (`tmutil listlocalsnapshots /`). Never present a plan
covering a small share of used space without saying where the rest is.

When less than 5 GB is free and work is blocked, skip the survey: propose the
script's regenerates rows without a `<placeholder>` as one batch for a single
approval, then survey if the target is still unmet.

## Plan and run

Classify each candidate as **regenerates** (the tool refills it on demand),
**rebuildable** (costs a rebuild or re-download), or **keep** (user data,
state no tool recreates, or held open by a running process). Only the first
two enter the plan.

Present one table, largest first, and stop for approval:

| Path | Size | Class | Recreated by | Command |
| ---- | ---- | ----- | ------------ | ------- |

Mark rows that need something closed first and show the sum against the
target.

Run approved commands one at a time, re-measuring with `df` after each. A
command that freed far less than its row's size usually left the space in a VM
disk or a snapshot; say which. Report free space before and after, and the
largest remaining keep items.
