#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test
cat >src/cache.js <<'EOF_1'
'use strict';

class ResponseCache {
  constructor() {
    this.entries = new Map();
  }

  read(path) {
    const entry = this.entries.get(path);
    if (entry === undefined) return null;
    return entry.body;
  }

  write(path, body) {
    this.entries.set(path, { body });
  }
}

module.exports = { ResponseCache };
EOF_1

git init -q
git add -A
git -c user.name=Eval -c user.email=eval@example.invalid -c commit.gpgsign=false \
  commit -q -m "feat: add a response cache for pricing lookups"

cat >src/cache.js <<'EOF_2'
'use strict';

// Matches the pricing API's signature rotation interval: an entry older than
// one rotation carries a signature that downstream verification rejects.
const TTL_MS = 300 * 1000;

class ResponseCache {
  constructor(now = () => performance.now()) {
    this.entries = new Map();
    this.now = now;
  }

  read(path) {
    const entry = this.entries.get(path);
    if (entry === undefined || this.now() - entry.storedAt > TTL_MS) return null;
    return entry.body;
  }

  write(path, body) {
    this.entries.set(path, { body, storedAt: this.now() });
  }
}

module.exports = { ResponseCache, TTL_MS };
EOF_2

cat >test/cache.test.js <<'EOF_3'
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ResponseCache, TTL_MS } = require('../src/cache.js');

test('an entry older than one signature rotation reads as a miss', () => {
  let clock = 0;
  const cache = new ResponseCache(() => clock);
  cache.write('/prices/sku-1', '{"cents":1299}');
  clock = TTL_MS + 1;
  assert.equal(cache.read('/prices/sku-1'), null);
});
EOF_3

git add -A
