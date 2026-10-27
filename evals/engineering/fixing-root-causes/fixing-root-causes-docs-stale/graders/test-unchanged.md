---
type: regex
pattern: 'test\("treats underscores as separators", \(\) => assert\.equal\(slugify\("snake_case"\), "snake-case"\)\);'
target: { source: file, path: test/slugify.test.js }
---
