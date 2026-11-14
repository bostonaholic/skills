---
type: regex
pattern: 'git add (?:-p|--patch)\b'
target: last_message
match: not_contains
---
