---
name: freeing-disk-space
description: Finds what fills a developer machine's disk and frees space by clearing caches, build outputs, and other regenerable files, running each deletion only after approval. Use when a disk is full or nearly full, builds or containers fail for lack of space, or the user asks to clean up or reclaim disk space.
---

# Freeing disk space

Find where the space went, then remove only what a tool can recreate. Every
deletion runs after the user approves its exact command.

## Rules

- **Approval first.** Show the exact command and what it removes. Run nothing
  that deletes until the user approves that command.
- **The owning tool cleans its own files.** Prefer `brew cleanup`,
  `docker builder prune`, or `xcrun simctl delete unavailable` over `rm` on the
  tool's directories. The tool knows what is in use; `rm` does not.
- **Never propose user data.** Documents, photos, mail, device backups, source
  trees with uncommitted or unpushed work, container volumes, VM disks, and
  databases are reported with their size and left to the user.
- **Never empty the Trash.** Report its size and tell the user to empty it.
- **Stop at the target.** The goal is enough free space to work, not every
  reclaimable byte.

## 1. Measure

Run `df -h` on the full volume (on macOS, `df -h /System/Volumes/Data`) and
record used and available space. Set the target: the user's number when they
give one, otherwise whichever is larger of 20 GB or 10% of the volume free,
which leaves room for a large build or image pull.

When less than 5 GB is free and builds or containers are already failing, go
to [Urgent recovery](#urgent-recovery) first.

## 2. Find where the space went

1. Size the home directory one level deep, largest first:
   `du -xhd 1 ~ 2>/dev/null | sort -rh | head -20`.
2. Descend into each large entry the same way until the totals reach files or
   directories a tool owns. `du` over large trees is slow; run it in the
   background rather than skipping a tree.
3. Check the locations in [cache locations](references/cache-locations.md)
   for each toolchain present on the machine. Read that file now.
4. Add up what you found and compare it with the used space from step 1. When
   much of it is unexplained, size the volume root and `/private/var` (or
   `/var` on Linux), other users' home directories, and, on macOS, local Time
   Machine snapshots (`tmutil listlocalsnapshots /`). Name any remainder you
   cannot explain; never present a plan that covers a small share of the used
   space without saying where the rest is.

## 3. Classify

Put each candidate in one class:

- **Regenerates on its own:** download and build caches the tool refills on
  demand. Costs only time.
- **Rebuildable:** build outputs, simulators, emulator images, container
  images, old toolchain versions. Costs a rebuild or re-download, and may break
  something offline.
- **Keep:** user data, anything with state that no tool recreates, and
  anything a running process holds open (`lsof +D <path>` on a directory).

Only the first two classes enter the plan.

## 4. Plan

Present one table, largest first, and stop for approval:

| Path | Size | Class | Recreated by | Command |
| ---- | ---- | ----- | ------------ | ------- |

Mark rows that need a tool or app closed first, such as an IDE, the Gradle
daemon, or a simulator. Show the sum against the target.

## 5. Run and verify

Run the approved commands one at a time. After each, re-run the step 1 `df`
and record the space it freed; a command that freed far less than its row's
size usually left the space in a VM disk or a snapshot, so say which. Stop
once the target is met, even with approved rows left, and say which rows you
skipped.

Report the free space before and after, each command's result, and the
largest remaining items in the Keep class.

## Urgent recovery

When the disk is nearly full and work is blocked, skip the full survey:

1. Size only the regenerable caches from
   [cache locations](references/cache-locations.md) that exist on this machine.
2. Propose them as one batch, with the commands, for a single approval.
3. Run them, measure with `df`, and continue at step 2 if the target is not
   met.
