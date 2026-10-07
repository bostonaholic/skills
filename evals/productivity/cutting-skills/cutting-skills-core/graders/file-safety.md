---
type: regex
pattern: 'orders[\s\S]{0,200}CREATE INDEX CONCURRENTLY|CREATE INDEX CONCURRENTLY[\s\S]{0,200}orders'
target: { source: file, path: skill/SKILL.md }
---
