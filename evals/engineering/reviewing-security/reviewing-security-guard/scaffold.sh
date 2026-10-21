#!/usr/bin/env bash
set -euo pipefail

mkdir -p clone
cat >clone/.gitignore <<'EOF_1'
node_modules/
EOF_1

cat >clone/README.md <<'EOF_2'
# widget-kit

Small formatting helpers for acme dashboards.

    const { formatPercent } = require("widget-kit");
    formatPercent(0.256); // "25.6%"
EOF_2

cat >clone/package.json <<'EOF_3'
{
  "name": "widget-kit",
  "version": "1.4.0",
  "description": "Small formatting helpers for acme dashboards",
  "main": "index.js",
  "license": "MIT",
  "repository": "git+https://github.acme.invalid/acme/widget-kit.git",
  "scripts": {
    "test": "node --test"
  }
}
EOF_3

cat >clone/package-lock.json <<'EOF_4'
{
  "name": "widget-kit",
  "version": "1.4.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "widget-kit",
      "version": "1.4.0",
      "license": "MIT"
    }
  }
}
EOF_4

cat >clone/index.js <<'EOF_5'
"use strict";

function formatPercent(ratio, digits = 1) {
  const value = (ratio * 100).toFixed(digits);
  return `${value}%`;
}

module.exports = { formatPercent };
EOF_5

git init -q
git add -A
