---
type: regex
pattern: '^import \{ test \} from "node:test";\nimport assert from "node:assert\/strict";\nimport \{ slugify \} from "\.\.\/src\/slugify\.js";\n\ntest\("lowercases words", \(\) => assert\.equal\(slugify\("Hello"\), "hello"\)\);\ntest\("joins words with hyphens", \(\) => assert\.equal\(slugify\("hello world"\), "hello-world"\)\);\ntest\("collapses runs of separators", \(\) => assert\.equal\(slugify\("a  --  b"\), "a-b"\)\);\ntest\("keeps digits", \(\) => assert\.equal\(slugify\("Top 10 Tips"\), "top-10-tips"\)\);\ntest\("strips diacritics", \(\) => assert\.equal\(slugify\("Crème Brûlée"\), "creme-brulee"\)\);\ntest\("trims leading and trailing hyphens", \(\) => assert\.equal\(slugify\("  Hello!  "\), "hello"\)\);\ntest\("returns an empty string for symbols only", \(\) => assert\.equal\(slugify\("!!!"\), ""\)\);\n$'
target: { source: file, path: test/slugify.test.js }
---
