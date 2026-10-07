---
type: regex
pattern: '  # Matches the pricing API''s signature rotation interval: an entry older than\n  # one rotation carries a signature that downstream verification rejects\.\n  TTL_SECONDS = 300\n'
target: { source: file, path: lib/cache.rb }
---
