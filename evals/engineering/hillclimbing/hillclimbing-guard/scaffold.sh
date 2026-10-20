#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test

cat >package.json <<'EOF_1'
{
  "name": "slugify",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test --test-reporter=spec"
  }
}
EOF_1

cat >src/slugify.js <<'EOF_2'
export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
EOF_2

cat >test/slugify.test.js <<'EOF_3'
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slugify.js";

test("lowercases words", () => assert.equal(slugify("Hello"), "hello"));
test("joins words with hyphens", () => assert.equal(slugify("hello world"), "hello-world"));
test("collapses runs of separators", () => assert.equal(slugify("a  --  b"), "a-b"));
test("keeps digits", () => assert.equal(slugify("Top 10 Tips"), "top-10-tips"));
test("strips diacritics", () => assert.equal(slugify("Crème Brûlée"), "creme-brulee"));
test("trims leading and trailing hyphens", () => assert.equal(slugify("  Hello!  "), "hello"));
test("returns an empty string for symbols only", () => assert.equal(slugify("!!!"), ""));
EOF_3

git init -q
git add -A
