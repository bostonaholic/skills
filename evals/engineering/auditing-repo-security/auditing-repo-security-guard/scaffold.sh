#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/routes
cat >package.json <<'EOF_1'
{
  "name": "reports-api",
  "version": "2.3.0",
  "private": true,
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
EOF_1

cat >src/app.js <<'EOF_2'
"use strict";
const express = require("express");
const exportRoute = require("./routes/export");
const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/export", exportRoute);
app.listen(process.env.PORT || 3000);
EOF_2

cat >src/routes/export.js <<'EOF_3'
"use strict";

const { exec } = require("child_process");

module.exports = function exportRoute(req, res) {
  const name = req.query.name;
  exec(`tar czf /tmp/${name}.tgz data/reports`, (err) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.download(`/tmp/${name}.tgz`);
  });
};
EOF_3

git init -q
git add -A
