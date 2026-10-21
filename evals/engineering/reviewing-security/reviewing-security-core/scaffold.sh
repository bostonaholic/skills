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
app.get("/debug/env", (req, res) => res.json(process.env));
app.get("/export", exportRoute);
app.listen(process.env.PORT || 3000);
EOF_2

cat >src/routes/export.js <<'EOF_3'
"use strict";

const { exec } = require("child_process");

module.exports = function exportRoute(req, res) {
  const since = req.query.since;
  exec(`git log --since="${since}" --pretty=format:%h,%s`, (err, stdout) => {
    if (err) {
      res.sendStatus(500);
      return;
    }
    res.type("text/plain").send(stdout);
  });
};
EOF_3

git init -q
git add -A
