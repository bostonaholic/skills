#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/format
cat >package.json <<'EOF_1'
{
  "name": "calendar-api",
  "version": "1.5.0",
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

cat >src/format/month.js <<'EOF_2'
"use strict";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

module.exports = { MONTH_NAMES };
EOF_2

cat >src/app.js <<'EOF_3'
"use strict";
const express = require("express");
const { MONTH_NAMES } = require("./format/month");
const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/today", (req, res) => {
  const now = new Date();
  res.json({ date: `${now.getUTCDate()} ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}` });
});
app.listen(process.env.PORT || 3000);
EOF_3

git init -q
git add -A
