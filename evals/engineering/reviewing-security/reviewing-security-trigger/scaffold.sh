#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/routes
cat >package.json <<'EOF_1'
{
  "name": "blog-api",
  "version": "1.2.0",
  "private": true,
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.21.2",
    "pg": "^8.13.1"
  }
}
EOF_1

cat >src/db.js <<'EOF_2'
"use strict";

const { Pool } = require("pg");

module.exports = new Pool({ connectionString: process.env.DATABASE_URL });
EOF_2

cat >src/app.js <<'EOF_3'
"use strict";
const express = require("express");
const searchRoute = require("./routes/search");
const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/search", searchRoute);
app.listen(process.env.PORT || 3000);
EOF_3

cat >src/routes/search.js <<'EOF_4'
"use strict";

const db = require("../db");

module.exports = async function searchRoute(req, res) {
  const tag = String(req.query.tag || "");
  let match;
  try {
    match = new RegExp(String(req.query.match || ""), "i");
  } catch {
    res.sendStatus(400);
    return;
  }
  try {
    const { rows } = await db.query(
      "SELECT id, title FROM posts WHERE published = true AND tag = $1 ORDER BY id",
      [tag],
    );
    res.json(rows.filter((row) => match.test(row.title)));
  } catch {
    res.sendStatus(500);
  }
};
EOF_4

git init -q
git add -A
