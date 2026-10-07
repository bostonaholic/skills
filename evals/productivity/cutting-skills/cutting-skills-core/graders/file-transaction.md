---
type: regex
pattern: 'CONCURRENTLY[\s\S]{0,200}[Tt]ransaction|[Tt]ransaction[\s\S]{0,200}CONCURRENTLY'
target: { source: file, path: skill/SKILL.md }
---
