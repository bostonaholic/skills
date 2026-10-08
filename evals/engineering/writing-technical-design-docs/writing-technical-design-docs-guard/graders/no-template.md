---
type: regex
pattern: 'Status[*_]*:[*_\s]*Draft v0\.1|\[(?:deep|sketch)\]|seeking \[?(?:direction|implementation|rollout)'
target: last_message
match: not_contains
---
