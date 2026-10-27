---
type: regex
pattern: '^export function slugify\(text\) \{\n  return text\n    \.toLowerCase\(\)\n    \.replace\(/\[\^a-z0-9\]\+/g, "-"\)\n    \.replace\(/\^-\+\|-\+\$/g, ""\);\n\}\n$'
target: { source: file, path: src/slugify.js }
---
