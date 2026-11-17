---
type: regex
pattern: '  # Matches the pricing API''s signature rotation interval: an entry older than\n  # one rotation carries a signature that downstream verification rejects\.\n[\s\S]*    # FIXME: normalize_key should drop the trailing slash; strip it here until it does\.\n[\s\S]*      # Return the cached body\.\n[\s\S]*  # Monotonic, because NTP steps the wall clock on the cache hosts, and a\n  # backward step would keep entries alive past their TTL\.\n'
target: { source: file, path: lib/cache.rb }
---
