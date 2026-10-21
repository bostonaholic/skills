#!/usr/bin/env bash
#
# Measure the volume that holds $HOME and size every known developer-tool
# location under it that exists. Read-only: it runs df and du, nothing else.
#
#   usage: measure-caches.sh
#
# Takes no arguments. Reads HOME and USER; MEASURE_CACHES_OS overrides
# `uname -s` (Darwin or Linux) so tests can pin the platform.
#
# Writes tab-separated lines to stdout. The first line is the volume:
#
#   mount  size  used  free  target  short
#
# with every number in bytes. target is the default free-space goal, the
# larger of 20 GB or 10% of the volume size. short is how far free is below
# target, 0 when it is not.
#
# Each later line is one known location that exists, largest first:
#
#   path  bytes  class  recreated-by  command  close-first
#
#   class         regenerates, rebuildable, or keep
#   recreated-by  what recreates it, "-" for keep
#   command       the cleanup command, with <placeholders> for the parts the
#                 agent chooses, "-" for keep
#   close-first   what to quit or stop before running the command, "-" for none
#
# Exit codes:
#
#   0   every line was printed
#   1   df or du printed no size, or the platform is neither Darwin nor Linux
#   64  usage error: an argument was given
#   69  a required tool is missing

set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "usage: $0   (takes no arguments)" >&2
  exit 64
fi

for tool in awk df du sort uname; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: missing required tool: $tool" >&2
    exit 69
  fi
done

os=${MEASURE_CACHES_OS:-$(uname -s)}
user=${USER:-$(id -un)}

# The default goal leaves room for a large build or image pull: 20 GB on any
# disk, or 10% of a larger one. GB here is 10^9 bytes, the unit macOS Finder
# and most disk vendors use.
gb=1000000000
min_target=$((20 * gb))
target_percent=10

is_count() { [[ $1 =~ ^[0-9]+$ ]]; }

# df -P prints one line per filesystem in a fixed column order; the mount
# point is every field after the fifth, so it may contain spaces.
read -r size_k used_k free_k mount < <(
  df -Pk -- "$HOME" | awk 'NR == 2 { m = $0; sub(/^([^ ]+ +){5}/, "", m); print $2, $3, $4, m }'
) || true
if ! is_count "${size_k:-}" || ! is_count "${used_k:-}" || ! is_count "${free_k:-}"; then
  echo "error: df printed no size for the volume holding $HOME" >&2
  exit 1
fi

size=$((size_k * 1024))
used=$((used_k * 1024))
free=$((free_k * 1024))
target=$((size * target_percent / 100))
((target < min_target)) && target=$min_target
short=$((target > free ? target - free : 0))
printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$mount" "$size" "$used" "$free" "$target" "$short"

rows=""

# Size PATH when it is a directory and record it with its class, what
# recreates it, its cleanup command, and what to close first.
row() {
  local path=$1 out kib
  [[ -d $path ]] || return 0
  # du exits non-zero when part of a tree is unreadable but still prints a
  # total for the rest; keep that total and let du's own warning stand.
  out=$(du -skx -- "$path") || echo "warning: du could not read all of $path; its size is a lower bound" >&2
  kib=${out%%[[:space:]]*}
  if ! is_count "$kib"; then
    echo "error: du printed no size for $path" >&2
    exit 1
  fi
  rows+=$(printf '%s\t%s\t%s\t%s\t%s\t%s' "$path" "$((kib * 1024))" "$2" "$3" "$4" "$5")$'\n'
}

gradle_stop="the Gradle daemon (gradle --stop)"

case $os in
  Darwin)
    row "$HOME/Library/Developer/Xcode/DerivedData" regenerates Xcode \
      'rm -rf ~/Library/Developer/Xcode/DerivedData/*' Xcode
    for platform in iOS watchOS tvOS; do
      row "$HOME/Library/Developer/Xcode/$platform DeviceSupport" regenerates \
        "Xcode, when a device on that OS version connects" \
        "rm -rf ~/Library/Developer/Xcode/\"$platform DeviceSupport\"/<version>, for each version no device runs" Xcode
    done
    row "$HOME/Library/Developer/CoreSimulator" rebuildable Xcode \
      'xcrun simctl delete unavailable' Simulator
    row "$HOME/Library/Caches/com.apple.dt.Xcode" regenerates Xcode \
      'rm -rf ~/Library/Caches/com.apple.dt.Xcode' Xcode
    row "$HOME/Library/Caches/org.swift.swiftpm" regenerates "Swift Package Manager" \
      'rm -rf ~/Library/Caches/org.swift.swiftpm' Xcode
    row "$HOME/Library/Caches/CocoaPods" regenerates CocoaPods 'pod cache clean --all' -
    row "$HOME/Library/Developer/Xcode/Archives" keep - - -
    row "$HOME/Library/Application Support/MobileSync/Backup" keep - - -
    row "$HOME/Library/Caches/Homebrew" regenerates Homebrew 'brew cleanup --prune=all' -
    row "$HOME/Library/Logs" regenerates "each app" \
      'find ~/Library/Logs -type f -mtime +30 -delete' -
    row "$HOME/Library/Caches/JetBrains" regenerates "the JetBrains IDE" \
      'rm -rf ~/Library/Caches/JetBrains/<product-version>, for each version no longer installed' "the JetBrains IDE"
    row "$HOME/Library/Application Support/JetBrains" keep - - -
    row "$HOME/Library/Android/sdk" rebuildable "Android Studio's SDK Manager" \
      'sdkmanager --uninstall "<package>", for each unused package' "Android Studio"
    row "$HOME/Library/Caches/pip" regenerates pip 'pip cache purge' -
    row "$HOME/Library/Caches/pypoetry" regenerates Poetry 'poetry cache clear --all <cache>, for each cache poetry cache list names' -
    row "$HOME/Library/Caches/Yarn" regenerates Yarn 'yarn cache clean' -
    row "$HOME/Library/pnpm/store" regenerates pnpm 'pnpm store prune' -
    row "$HOME/Library/Caches/go-build" regenerates Go 'go clean -cache' -
    row "$HOME/.Trash" keep - - -
    row "/private/var/tmp/_bazel_$user" rebuildable Bazel \
      'bazel clean --expunge in each workspace; for an orphaned output base, chmod -R u+w <base> && rm -rf <base>' -
    ;;
  Linux)
    row "$HOME/.cache/JetBrains" regenerates "the JetBrains IDE" \
      'rm -rf ~/.cache/JetBrains/<product-version>, for each version no longer installed' "the JetBrains IDE"
    row "$HOME/.config/JetBrains" keep - - -
    row "$HOME/Android/Sdk" rebuildable "Android Studio's SDK Manager" \
      'sdkmanager --uninstall "<package>", for each unused package' "Android Studio"
    row "$HOME/.cache/pip" regenerates pip 'pip cache purge' -
    row "$HOME/.cache/pypoetry" regenerates Poetry 'poetry cache clear --all <cache>, for each cache poetry cache list names' -
    row "$HOME/.cache/yarn" regenerates Yarn 'yarn cache clean' -
    row "$HOME/.local/share/pnpm/store" regenerates pnpm 'pnpm store prune' -
    row "$HOME/.cache/go-build" regenerates Go 'go clean -cache' -
    row "$HOME/.local/share/Trash" keep - - -
    row "$HOME/.cache/bazel/_bazel_$user" rebuildable Bazel \
      'bazel clean --expunge in each workspace; for an orphaned output base, chmod -R u+w <base> && rm -rf <base>' -
    ;;
  *)
    echo "error: unsupported platform: $os (expected Darwin or Linux)" >&2
    exit 1
    ;;
esac

row "$HOME/.gradle/caches" regenerates Gradle 'rm -rf ~/.gradle/caches' "$gradle_stop"
row "$HOME/.gradle/wrapper/dists" rebuildable "the Gradle wrapper" \
  "rm -rf ~/.gradle/wrapper/dists/<version>, for each version no project's wrapper names" "$gradle_stop"
row "$HOME/.gradle/daemon" regenerates Gradle 'rm -rf ~/.gradle/daemon' "$gradle_stop"
row "$HOME/.m2/repository" rebuildable "Maven, except artifacts installed with mvn install" \
  'rm -rf ~/.m2/repository' -
row "$HOME/.android/avd" keep - - -
row "$HOME/.npm/_cacache" regenerates npm 'npm cache clean --force' -
row "$HOME/.bun/install/cache" regenerates Bun 'bun pm cache rm' -
row "$HOME/.cache/uv" regenerates uv 'uv cache prune' -
row "$HOME/.cargo/registry/cache" regenerates Cargo 'rm -rf ~/.cargo/registry/cache' -
row "$HOME/.cargo/registry/src" regenerates Cargo 'rm -rf ~/.cargo/registry/src' -
row "$HOME/.cargo/git/checkouts" regenerates Cargo 'rm -rf ~/.cargo/git/checkouts' -
row "$HOME/.rustup/toolchains" rebuildable rustup \
  'rustup toolchain uninstall <name>, for each unpinned toolchain' -
row "$HOME/go/pkg/mod" regenerates Go 'go clean -modcache' -
row "$HOME/.pyenv/versions" rebuildable pyenv 'pyenv uninstall <version>, for each unpinned version' -
row "$HOME/.rbenv/versions" rebuildable rbenv 'rbenv uninstall <version>, for each unpinned version' -
row "$HOME/.rvm/rubies" rebuildable RVM 'rvm remove <ruby>, for each unpinned version' -
row "$HOME/.nvm/versions/node" rebuildable nvm 'nvm uninstall <version>, for each unpinned version' -
row "$HOME/.asdf/installs" rebuildable asdf 'asdf uninstall <tool> <version>, for each unpinned version' -

# Largest first; equal sizes fall back to path order so output is stable.
printf '%s' "$rows" | LC_ALL=C sort -t $'\t' -k2,2nr -k1,1
