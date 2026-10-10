---
type: regex
pattern: '(?=[\s\S]*Postgres advisory lock)(?=[\s\S]*migration renames a column)(?=[\s\S]*share one Redis database)(?=[\s\S]*Seed data no longer matches)(?=[\s\S]*OpenAPI docs must be regenerated)(?=[\s\S]*no arm64 build)(?=[\s\S]*CI bundle cache misses)(?=[\s\S]*Local HTTPS needs certs)(?=[\s\S]*Feature flags default to on)(?=[\s\S]*Sidekiq dev queue swallows)(?=[\s\S]*claim port 6006)(?=[\s\S]*zsh shells take two seconds)'
flags: i
target: last_message
---
