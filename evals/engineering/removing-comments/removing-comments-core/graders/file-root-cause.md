---
type: regex
pattern: '    # FIXME: normalize_key should drop the trailing slash; strip it here until it does\.\n    key = normalize_key\(path\)\.chomp\("/"\)\n'
target: { source: file, path: lib/cache.rb }
---
