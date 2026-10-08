---
name: freeing-disk-space
description: Finds what fills a developer machine's disk and frees space by clearing caches, build outputs, and other regenerable files, running each deletion only after approval. Use when a disk is full or nearly full, builds or containers fail for lack of space, or the user asks to clean up or reclaim disk space.
---

# Freeing disk space

Find where the space went, then remove only what a tool can recreate.

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
- **Keep pinned toolchain versions.** Before removing an old Ruby, Node,
  Python, or similar version, check which versions projects pin.
- **Stop at the target.** The user's number when they give one, otherwise
  whichever is larger of 20 GB or 10% of the volume free, which leaves room
  for a large build or image pull. Stop once it is met, even with approved
  rows left, and say which rows you skipped.

## Find where the space went

Measure the full volume first (on macOS, `df -h /System/Volumes/Data`). Then
descend with `du -x` from the home directory until totals reach directories a
tool owns, and check [cache locations](references/cache-locations.md) for each
toolchain present. Run slow `du` passes in the background rather than skipping
a tree.

Add up what you found and compare it with the used space. When much is
unexplained, size the volume root and `/private/var` (or `/var` on Linux),
other users' home directories, and, on macOS, local Time Machine snapshots
(`tmutil listlocalsnapshots /`). Never present a plan that covers a small share
of the used space without saying where the rest is.

When less than 5 GB is free and work is blocked, skip the full survey: size
only the regenerable caches that exist, propose them as one batch for a single
approval, then survey if the target is still unmet.

## Plan and run

Classify each candidate as **regenerates** (the tool refills it on demand),
**rebuildable** (costs a rebuild or re-download, may break something offline),
or **keep** (user data, state no tool recreates, or held open by a running
process). Only the first two enter the plan.

Present one table, largest first, and stop for approval:

| Path | Size | Class | Recreated by | Command |
| ---- | ---- | ----- | ------------ | ------- |

Mark rows that need a tool or app closed first (an IDE, the Gradle daemon, a
simulator) and show the sum against the target.

Run approved commands one at a time and re-measure with `df` after each. A
command that freed far less than its row's size usually left the space in a VM
disk or a snapshot; say which. Report free space before and after, and the
largest remaining items in the keep class.
