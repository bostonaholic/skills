#!/usr/bin/env bash
set -euo pipefail

cat >pr-inputs-home.md <<'EOF_1'
## Why

The dashboard gives no warning before the API starts returning 429 responses, so users lose their unsaved filters when a request fails.

## Verification

- `npm test`: passed. The banner tests cover the 80 percent threshold and the dismiss button.
- `npm run lint`: passed.

## Closing line

Closes #42

## Capture gap

- dev server did not start: `npm run dev` exited 1 with "port 5173 is already in use"

## Changelog

- Added a dashboard banner that warns when the API rate limit is near.
EOF_1

git init -q
git add -A
