---
type: regex
pattern: 'def write\(path, body\)(?:(?!\n  def )[\s\S])*?@lock\.synchronize(?:(?!\n  def )[\s\S])*?purge_expired'
target: { source: file, path: lib/cache.rb }
---
