---
type: regex
pattern: '  # Monotonic, because NTP steps the wall clock on the cache hosts, and a\n  # backward step would keep entries alive past their TTL\.\n  def now\n'
target: { source: file, path: lib/cache.rb }
---
