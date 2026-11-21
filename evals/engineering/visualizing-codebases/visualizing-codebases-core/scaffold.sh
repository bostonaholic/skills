#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/http src/accounts src/entries src/notify src/db
cat >README.md <<'EOF_1'
# ledger

The accounting ledger service. Accountants use it over HTTPS. It stores
accounts and entries in PostgreSQL and posts entry notices to the Slack
webhook API.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "ledger",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "main": "src/http/routes.js",
  "scripts": {
    "start": "node src/http/routes.js"
  },
  "dependencies": {
    "pg": "^8.13.0"
  }
}
EOF_2

cat >Dockerfile <<'EOF_3'
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/http/routes.js"]
EOF_3

cat >src/http/routes.js <<'EOF_4'
import http from "node:http";
import { openAccount } from "../accounts/accountService.js";
import { postEntry } from "../entries/entryService.js";

async function route(req, res) {
  if (req.method === "POST" && req.url === "/accounts") return openAccount(req, res);
  if (req.method === "POST" && req.url === "/entries") return postEntry(req, res);
  res.writeHead(404).end();
}

http.createServer(route).listen(process.env.PORT ?? 3000);
EOF_4

cat >src/accounts/accountService.js <<'EOF_5'
import { saveAccount, findAccount } from "./accountRepo.js";
import { entriesFor } from "../entries/entryService.js";

export async function openAccount(req, res) {
  const account = await saveAccount({ balanceCents: 0 });
  res.writeHead(201).end(JSON.stringify(account));
}

export async function accountBalance(accountId) {
  const account = await findAccount(accountId);
  const entries = await entriesFor(accountId);
  return entries.reduce((total, entry) => total + entry.amountCents, account.balanceCents);
}
EOF_5

cat >src/accounts/accountRepo.js <<'EOF_6'
import { pool } from "../db/pool.js";

export async function saveAccount(account) {
  const { rows } = await pool.query("INSERT INTO accounts (balance_cents) VALUES ($1) RETURNING *", [account.balanceCents]);
  return rows[0];
}

export async function findAccount(id) {
  const { rows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [id]);
  return rows[0];
}
EOF_6

cat >src/entries/entryService.js <<'EOF_7'
import { saveEntry, listEntries } from "./entryRepo.js";
import { accountBalance } from "../accounts/accountService.js";
import { announce } from "../notify/slack.js";

export async function postEntry(req, res) {
  const { accountId, amountCents } = JSON.parse(req.body ?? "{}");
  const entry = await saveEntry({ accountId, amountCents });
  const balance = await accountBalance(accountId);
  await announce(`Entry ${entry.id} posted, balance ${balance}`);
  res.writeHead(201).end(JSON.stringify(entry));
}

export async function entriesFor(accountId) {
  return listEntries(accountId);
}
EOF_7

cat >src/entries/entryRepo.js <<'EOF_8'
import { pool } from "../db/pool.js";

export async function saveEntry(entry) {
  const { rows } = await pool.query("INSERT INTO entries (account_id, amount_cents) VALUES ($1, $2) RETURNING *", [entry.accountId, entry.amountCents]);
  return rows[0];
}

export async function listEntries(accountId) {
  const { rows } = await pool.query("SELECT * FROM entries WHERE account_id = $1", [accountId]);
  return rows;
}
EOF_8

cat >src/notify/slack.js <<'EOF_9'
export async function announce(text) {
  await fetch("https://hooks.slack.com/services/" + process.env.SLACK_WEBHOOK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text })
  });
}
EOF_9

cat >src/db/pool.js <<'EOF_10'
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
EOF_10

git init -q
git add -A
