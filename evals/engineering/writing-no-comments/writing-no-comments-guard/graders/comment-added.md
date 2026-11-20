---
type: regex
pattern: '\n  # Overwrites any entry already stored for the path\.\n  def write\(path, body\)'
target: { source: file, path: lib/cache.rb }
---
