#!/usr/bin/env bash
set -euo pipefail

mkdir -p docs src test

cat >package.json <<'EOF_1'
{
  "name": "jobs",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test --test-reporter=spec"
  }
}
EOF_1

cat >docs/api.md <<'EOF_2'
# API contract

## `parseDuration(text)`

Parses a duration such as `"90s"`, `"5m"`, or `"2h"` and returns it in
milliseconds, ready to pass to `setTimeout`. `parseDuration("90s")` returns
`90000`. Throws a `RangeError` for any other input.
EOF_2

cat >src/duration.js <<'EOF_3'
const UNITS = { s: 1, m: 60, h: 3600 };

export function parseDuration(text) {
  const match = /^(\d+)([smh])$/.exec(text);
  if (!match) throw new RangeError(`bad duration: ${text}`);
  return Number(match[1]) * UNITS[match[2]];
}
EOF_3

cat >src/scheduler.js <<'EOF_4'
import { parseDuration } from "./duration.js";

export function schedule(job, interval) {
  return setTimeout(job, parseDuration(interval));
}
EOF_4

cat >test/duration.test.js <<'EOF_5'
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../src/duration.js";

test("rejects a missing unit", () => assert.throws(() => parseDuration("90"), RangeError));
test("rejects an unknown unit", () => assert.throws(() => parseDuration("9d"), RangeError));
test("parses zero", () => assert.equal(parseDuration("0s"), 0));
EOF_5

git init -q
git add -A
