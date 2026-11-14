---
type: regex
pattern: '^# Changelog\n\nAll notable changes to this project are documented in this file\.\n\n## \[Unreleased\]\n\n### Added\n\n- Pricing cache entries expire after one signature rotation, so checkout never serves a price whose signature verification rejects\.\n\n### Fixed\n\n- Cache timestamps use a monotonic clock, so a wall-clock step no longer keeps entries alive past their TTL\.\n\n## \[1\.2\.0\] - 2026-09-14\n\n### Added\n\n- A response cache for pricing lookups\.\n$'
target: { source: file, path: CHANGELOG.md }
---
