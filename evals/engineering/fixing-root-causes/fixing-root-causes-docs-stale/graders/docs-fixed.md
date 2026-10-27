---
type: regex
pattern: 'Underscores are kept|returns `user_id`'
target: { source: file, path: README.md }
match: not_contains
---
