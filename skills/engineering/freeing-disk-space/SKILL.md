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
  `docker builder prune`, or `xcrun simctl delete unavailable` over `rm` on the
  tool's directories. The tool knows what is in use; `rm` does not.
- **Never propose user data.** Documents, photos, mail, device backups, source
  trees with uncommitted or unpushed work, container volumes, VM disks, and
  databases are reported with their size and left to the user.
- **Never empty the Trash.** Report its size and tell the user to empty it.
- **Keep pinned toolchain versions.** Before removing a Ruby, Node, Python,
  Rust, or other toolchain version, run
  `scripts/list-pinned-versions.sh <workspace>` on each directory that holds
  the user's projects, and keep every version it prints. Exit 64 means the
  path is not a directory.
- **Stop at the target.** The user's number when they give one, otherwise the
  target `scripts/measure-caches.sh` prints. Stop once it is met, even with
  approved rows left, and say which rows you skipped.

## Find where the space went

Run `scripts/measure-caches.sh`, in the background, since `du` over large
caches can take minutes. Its first line is the volume: mount, size, used,
free, target, and short, in bytes. Each later line is a known location that
exists, largest first: path, bytes, class, recreated-by, command, and
close-first. Take those rows' class, recreated-by, and command as printed,
choosing what fills each `<placeholder>`; keep rows are reported, not
proposed. On exit 1 or 69, report its error and measure with `df -h` and
`du -x` by hand.

Then descend with `du -x` from the home directory into trees the script did
not list until totals reach directories a tool owns, and check
[cache locations](references/cache-locations.md) for each toolchain present.
Classifying those stays with you: a directory's path does not say whether it
holds user data.

Add up what you found and compare it with the used space. When much is
unexplained, size the volume root and `/private/var` (or `/var` on Linux),
other users' home directories, and, on macOS, local Time Machine snapshots
(`tmutil listlocalsnapshots /`). Never present a plan that covers a small share
of the used space without saying where the rest is.

When less than 5 GB is free and work is blocked, skip the full survey: propose
the script's regenerates rows without a `<placeholder>` as one batch for a
single approval, then survey if the target is still unmet.

## Plan and run

Classify each candidate as **regenerates** (the tool refills it on demand),
**rebuildable** (costs a rebuild or re-download, may break something offline),
or **keep** (user data, state no tool recreates, or held open by a running
process). Only the first two enter the plan.

Present one table, largest first, and stop for approval:

| Path | Size | Class | Recreated by | Command |
| ---- | ---- | ----- | ------------ | ------- |

Mark rows that need a tool or app closed first (the script's close-first
field, or an IDE, daemon, or simulator you find) and show the sum against the
target.

Run approved commands one at a time and re-measure with `df` after each. A
command that freed far less than its row's size usually left the space in a VM
disk or a snapshot; say which. Report free space before and after, and the
largest remaining items in the keep class.
