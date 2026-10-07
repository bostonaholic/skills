#!/usr/bin/env bash
set -euo pipefail

mkdir -p src
cat >src/cache.js <<'EOF_1'
'use strict';

// Matches the pricing API's signature rotation interval: an entry older than
// one rotation carries a signature that downstream verification rejects.
const TTL_MS = 300 * 1000;

class ResponseCache {
  constructor() {
    this.entries = new Map();
  }

  read(path) {
    const entry = this.entries.get(normalizeKey(path));
    if (entry === undefined || this.expired(entry)) return null;
    return entry.body;
  }

  write(path, body) {
    this.entries.set(normalizeKey(path), { body, storedAt: now() });
  }

  expired(entry) {
    return now() - entry.storedAt > TTL_MS;
  }
}

function normalizeKey(path) {
  return path.toLowerCase().replace(/\/$/, '');
}

function now() {
  return performance.now();
}

module.exports = { ResponseCache, TTL_MS };
EOF_1

git init -q
git add -A
