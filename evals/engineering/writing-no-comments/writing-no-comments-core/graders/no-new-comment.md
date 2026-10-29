---
type: regex
pattern: '^[^#\n]*#(?!\{)(?! Matches the pricing API''s signature| one rotation carries a signature| FIXME: normalize_key should| Return the cached body\.| Monotonic, because NTP| backward step would keep)'
target: { source: file, path: lib/cache.rb }
flags: m
match: not_contains
---
