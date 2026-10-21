# Cache locations

`scripts/measure-caches.sh` sizes every fixed-path location with its class,
cleanup command, and what to close first. This file covers the rest: cleanups
a tool sizes itself, outputs inside projects, and how to choose within a
listed location. Check only the sections for tools installed on the machine.
Classes match the skill's classes: **regenerates** (the tool refills it on
demand), **rebuildable** (costs a rebuild or re-download), and **keep**
(report only).

## Contents

- Operating system
- Homebrew
- Xcode and Apple platforms
- Android and Gradle
- JavaScript
- Python
- Ruby
- Rust
- Containers
- Bazel
- Git

## Operating system

macOS:

- `~/Library/Caches/<app>`, for apps the script does not list: per-app caches;
  regenerates. Quit the app, then remove its subdirectory. Never clear the
  whole directory while apps run.
- Local Time Machine snapshots: `tmutil listlocalsnapshots /`. macOS thins
  them under pressure on its own; deleting one loses that local restore point,
  so report the count and let the user decide.
- `/private/var/folders`: system temporary files. Never delete by hand; a
  restart clears stale entries.

Linux:

- `~/.cache/<app>`, for apps the script does not list: per-app caches;
  regenerates.
- systemd journal: `journalctl --disk-usage`, then
  `sudo journalctl --vacuum-size=500M`; regenerates.
- Package caches: `sudo apt-get clean` or `sudo dnf clean all`; regenerates.
- Snap: `snap list --all` shows disabled revisions;
  `sudo snap remove <name> --revision <rev>` removes one; rebuildable.

## Homebrew

- `brew cleanup -n --prune=all` previews what the script's Homebrew row
  removes, including old formula versions outside the cache directory.
- `brew autoremove` removes formulae installed only as dependencies of
  formulae since removed; rebuildable.

## Xcode and Apple platforms

- Simulator runtimes: `xcrun simctl runtime list`, then
  `xcrun simctl runtime delete <identifier>`; rebuildable from Xcode settings.
- DeviceSupport rows: each subdirectory is one device OS version.

## Android and Gradle

- Project `build/` directories: `./gradlew clean`; rebuildable.
- Android SDK row: `sdkmanager --list_installed` names the packages: unused
  system images, build tools, platforms, and NDKs.
- `~/.android/avd`: remove a device only when the user names it
  (`avdmanager delete avd -n <name>`).

## JavaScript

- Yarn 2 and later: `yarn cache clean --all`; regenerates.
- `node_modules` in projects the user confirms are inactive; rebuildable with
  an install. Size them with
  `find <workspace> -name node_modules -type d -prune -exec du -sh {} +`.
- Node versions from fnm or Volta: uninstall unpinned versions with the
  manager's own command; rebuildable.

## Python

- Poetry: `poetry cache list` names the caches the script's command clears.
- Conda: `conda clean --all`; regenerates.
- `.venv` directories in inactive projects; rebuildable.

## Ruby

- `gem cleanup --dryrun` previews; `gem cleanup` removes superseded versions of
  installed gems; rebuildable.
- `vendor/bundle` in inactive projects; rebuildable with `bundle install`.
- RVM: `rvm cleanup all` clears its download and source caches; regenerates.

## Rust

- Cargo `target/` directories, usually the largest Rust item: `cargo clean`
  in each inactive project; rebuildable.
- `rustup toolchain list` names the toolchains for the script's rustup row.

## Containers

Docker, and Docker-compatible runtimes such as Colima, OrbStack, and Podman
(`podman system df`, `podman system prune`):

- `docker system df` shows images, containers, volumes, and build cache.
- `docker builder prune`: build cache; regenerates.
- `docker image prune -a`: images no container uses; rebuildable by pull or
  build.
- `docker container prune`: stopped containers. A container's writable layer
  can hold data, so list them (`docker ps -a --filter status=exited`) and let
  the user confirm.
- Volumes: keep. `docker volume prune` deletes their data.

On macOS these runtimes store images in a VM disk file. Pruning frees space
inside the VM; the file may return it to macOS only after the runtime trims or
restarts. Measure with `df` after, and restart the runtime when little came
back.

## Bazel

The script's Bazel row is the output user root. It holds one output base per
workspace, named by a hash. Each output base's `DO_NOT_BUILD_HERE` file names
its workspace; an output base whose workspace no longer exists is orphaned.
Bazel makes its outputs read-only, hence the `chmod` in the row's command.

- A disk cache set with `--disk_cache` in a `.bazelrc`; regenerates.

## Git

- Forgotten worktrees: `git worktree list` in each repository. A worktree is
  removable only when `git -C <worktree> status --porcelain` prints nothing
  and its branch is pushed; then `git worktree remove <worktree>`. Otherwise
  keep. `git worktree prune` clears records of worktrees already deleted.
- `git count-objects -vH` sizes a repository's objects; `git gc` repacks them.
- Git LFS: `git lfs prune` removes local copies of LFS objects already pushed;
  rebuildable.
- Repositories the user no longer works on: keep; report their sizes.
