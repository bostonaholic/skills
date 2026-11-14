#!/usr/bin/env bash
set -euo pipefail

commit() {
  git -c user.name=Eval -c user.email=eval@example.invalid -c commit.gpgsign=false \
    commit -q -m "$1"
}

mkdir -p src
cat >CHANGELOG.md <<'EOF_1'
# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Pricing cache entries expire after one signature rotation, so checkout never serves a price whose signature verification rejects.

### Fixed

- Cache timestamps use a monotonic clock, so a wall-clock step no longer keeps entries alive past their TTL.

## [1.2.0] - 2026-09-14

### Added

- A response cache for pricing lookups.
EOF_1
printf "'use strict';\n" >src/cache.js
git init -q
git add -A
commit "v1.2.0 feat: add a response cache for pricing lookups"
git -c tag.gpgsign=false tag v1.2.0

printf "'use strict';\nconst TTL_MS = 300 * 1000;\n" >src/cache.js
git add -A
commit "feat(cache): expire pricing entries after one signature rotation"

printf "'use strict';\nconst TTL_MS = 300 * 1000;\nconst now = () => performance.now();\n" >src/cache.js
git add -A
commit "fix(cache): use a monotonic clock for cache timestamps"

printf "node_modules/\n" >.gitignore
git add -A
commit "chore: ignore node_modules"
