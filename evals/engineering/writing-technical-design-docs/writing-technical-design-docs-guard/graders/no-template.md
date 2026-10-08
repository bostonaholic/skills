---
type: regex
pattern: 'Status[*_]*:[*_\s]*Draft v0\.1|\[(?:deep|sketch)\]|60 to 80% complete|The (?:Encyclopedia|Option Buffet|Crystal Ball|Forever Draft|Solo Performance)|one-way doors named and argued|two-way door have a default'
target: last_message
match: not_contains
---
