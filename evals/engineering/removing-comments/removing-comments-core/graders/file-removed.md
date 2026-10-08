---
type: regex
pattern: '# Return the cached body\.'
target: { source: file, path: lib/cache.rb }
match: not_contains
---
