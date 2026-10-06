# Cache locations

Where developer tools keep regenerable files, and the command that clears each.
Check only the sections for tools installed on the machine. Classes match the
skill's step 3: **regenerates** (the tool refills it on demand), **rebuildable**
(costs a rebuild or re-download), and **keep** (report only).

Before removing a toolchain version, list the versions projects pin, for
example `find <workspace> -maxdepth 2 -name .ruby-version -exec cat {} + | sort | uniq -c`,
and keep every pinned version.

## Contents

- Operating system
- Homebrew
- Xcode and Apple platforms
- Android, Gradle, and Maven
- JavaScript
- Python
- Ruby
- Rust and Go
- JetBrains IDEs
- Containers
- Bazel
- Git

## Operating system

macOS:

- `~/Library/Caches/<app>`: per-app caches; regenerates. Quit the app, then
  remove its subdirectory. Never clear the whole directory while apps run.
- `~/Library/Logs`: regenerates. `find ~/Library/Logs -type f -mtime +30 -delete`
  removes logs untouched for 30 days.
- Local Time Machine snapshots: `tmutil listlocalsnapshots /`. macOS thins
  them under pressure on its own; deleting one loses that local restore point,
  so report the count and let the user decide.
- `/private/var/folders`: system temporary files. Never delete by hand; a
  restart clears stale entries.
- `~/Library/Application Support/MobileSync/Backup`: device backups; keep.
- `~/.Trash`: report its size; the user empties it.

Linux:

- `~/.cache/<app>`: per-app caches; regenerates.
- systemd journal: `journalctl --disk-usage`, then
  `sudo journalctl --vacuum-size=500M`; regenerates.
- Package caches: `sudo apt-get clean` or `sudo dnf clean all`; regenerates.
- Snap: `snap list --all` shows disabled revisions;
  `sudo snap remove <name> --revision <rev>` removes one; rebuildable.

## Homebrew

- `brew cleanup -n --prune=all` previews; `brew cleanup --prune=all` removes
  old versions and every cached download; regenerates.
- `brew autoremove` removes formulae installed only as dependencies of
  formulae since removed; rebuildable.

## Xcode and Apple platforms

Quit Xcode and the Simulator first.

- `~/Library/Developer/Xcode/DerivedData`: build products and indexes;
  regenerates. `rm -rf ~/Library/Developer/Xcode/DerivedData/*`.
- `~/Library/Developer/Xcode/iOS DeviceSupport` (and the watchOS and tvOS
  siblings): symbols copied from each device OS version; recreated when a
  device on that version connects. Remove versions no device runs.
- Simulators for runtimes no longer installed: `xcrun simctl delete unavailable`;
  rebuildable.
- Simulator runtimes: `xcrun simctl runtime list`, then
  `xcrun simctl runtime delete <identifier>`; rebuildable from Xcode settings.
- `~/Library/Caches/com.apple.dt.Xcode` and
  `~/Library/Caches/org.swift.swiftpm`: regenerates.
- CocoaPods: `pod cache clean --all`; regenerates.
- `~/Library/Developer/Xcode/Archives`: keep. Archived dSYMs symbolicate crash
  reports from shipped builds.

## Android, Gradle, and Maven

Stop Gradle daemons first: `./gradlew --stop` in a project, or `gradle --stop`.

- `~/.gradle/caches`: dependencies and build cache; regenerates.
- `~/.gradle/wrapper/dists`: one Gradle distribution per version; remove
  versions no project's wrapper names; rebuildable.
- `~/.gradle/daemon`: daemon logs; regenerates.
- Project `build/` directories: `./gradlew clean`; rebuildable.
- `~/.m2/repository`: Maven's local repository; rebuildable. Artifacts the
  user installed locally with `mvn install` come back only from their source.
- Android SDK (`~/Library/Android/sdk` on macOS, `~/Android/Sdk` on Linux):
  `sdkmanager --list_installed`, then `sdkmanager --uninstall "<package>"` for
  unused system images, build tools, platforms, and NDKs; rebuildable.
- `~/.android/avd`: emulator devices with their data; keep unless the user
  names a device to remove (`avdmanager delete avd -n <name>`).

## JavaScript

- npm: `npm cache clean --force` (`~/.npm/_cacache`); regenerates.
- Yarn 1: `yarn cache clean`. Yarn 2 and later: `yarn cache clean --all`;
  regenerates.
- pnpm: `pnpm store prune` removes packages no project references;
  regenerates.
- Bun: `bun pm cache rm`; regenerates.
- `node_modules` in projects the user confirms are inactive; rebuildable with
  an install. Size them with
  `find <workspace> -name node_modules -type d -prune -exec du -sh {} +`.
- Node versions from nvm, fnm, Volta, or asdf: uninstall unpinned versions
  with the manager's own command; rebuildable.

## Python

- pip: `pip cache purge`; regenerates.
- uv: `uv cache prune` removes unused entries; `uv cache clean` removes all;
  regenerates.
- Poetry: `poetry cache list`, then `poetry cache clear --all <cache>`;
  regenerates.
- Conda: `conda clean --all`; regenerates.
- `.venv` directories in inactive projects; rebuildable.
- pyenv versions: `pyenv uninstall <version>`; rebuildable.

## Ruby

- `gem cleanup --dryrun` previews; `gem cleanup` removes superseded versions of
  installed gems; rebuildable.
- `vendor/bundle` in inactive projects; rebuildable with `bundle install`.
- Ruby versions: `rbenv uninstall <version>`, `asdf uninstall ruby <version>`,
  or `rvm remove <ruby>`; rebuildable. With RVM, `rvm cleanup all` clears its
  download and source caches; regenerates.

## Rust and Go

- Cargo `target/` directories, usually the largest Rust item: `cargo clean`
  in each inactive project; rebuildable.
- `~/.cargo/registry/cache`, `~/.cargo/registry/src`, and
  `~/.cargo/git/checkouts`: downloaded crates; regenerates.
- Rust toolchains: `rustup toolchain list`, then
  `rustup toolchain uninstall <name>`; rebuildable.
- Go: `go clean -cache` (build cache) and `go clean -modcache` (downloaded
  modules); regenerates.

## JetBrains IDEs

- Caches and indexes (`~/Library/Caches/JetBrains` on macOS,
  `~/.cache/JetBrains` on Linux) hold one directory per product version.
  Directories for versions no longer installed are leftovers; regenerates.
- Logs: `~/Library/Logs/JetBrains` on macOS; regenerates.
- Settings (`~/Library/Application Support/JetBrains`, `~/.config/JetBrains`):
  keep.

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

The output user root is `/private/var/tmp/_bazel_$USER` on macOS and
`~/.cache/bazel/_bazel_$USER` on Linux. It holds one output base per
workspace, named by a hash.

- `bazel clean --expunge`, run in a workspace, removes that workspace's
  output base; rebuildable.
- Each output base's `DO_NOT_BUILD_HERE` file names its workspace. An output
  base whose workspace no longer exists is orphaned; rebuildable. Bazel makes
  its outputs read-only, so the approved command is
  `chmod -R u+w <base> && rm -rf <base>`.
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
