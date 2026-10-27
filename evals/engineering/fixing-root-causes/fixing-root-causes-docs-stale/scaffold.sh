#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test

cat >package.json <<'EOF_1'
{
  "name": "slugify",
  "version": "1.2.0",
  "type": "module",
  "scripts": {
    "test": "node --test --test-reporter=spec"
  }
}
EOF_1

cat >README.md <<'EOF_2'
# slugify

Turns a title into a URL slug: lowercase ASCII letters and digits joined by
hyphens. Underscores are kept, so `slugify("user_id")` returns `user_id`.
EOF_2

cat >CHANGELOG.md <<'EOF_3'
# Changelog

## 1.2.0

- Underscores now separate words like spaces do: `snake_case` becomes `snake-case`.

## 1.1.0

- Strip leading and trailing hyphens.
EOF_3

cat >src/slugify.js <<'EOF_4'
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
EOF_4

cat >test/slugify.test.js <<'EOF_5'
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slugify.js";

test("joins words with hyphens", () => assert.equal(slugify("Hello World"), "hello-world"));
test("treats underscores as separators", () => assert.equal(slugify("snake_case"), "snake-case"));
test("trims hyphens", () => assert.equal(slugify("  Hi!  "), "hi"));
EOF_5

git init -q
git add -A
