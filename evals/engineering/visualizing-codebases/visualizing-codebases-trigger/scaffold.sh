#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/http src/orders src/payments src/db
cat >README.md <<'EOF_1'
# shop-api

The order service for the Acme shop. Shoppers use it over HTTPS through the
web storefront. It stores orders in PostgreSQL and charges cards through the
Stripe API.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "shop-api",
  "version": "2.1.0",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "pg": "^8.13.0",
    "stripe": "^17.0.0"
  }
}
EOF_2

cat >Dockerfile <<'EOF_3'
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/server.js"]
EOF_3

cat >src/server.js <<'EOF_4'
import http from "node:http";
import { route } from "./http/routes.js";

http.createServer(route).listen(process.env.PORT ?? 3000);
EOF_4

cat >src/http/routes.js <<'EOF_5'
import { placeOrder } from "../orders/orderService.js";
import { refund } from "../payments/paymentService.js";

export async function route(req, res) {
  if (req.method === "POST" && req.url === "/orders") return placeOrder(req, res);
  if (req.method === "POST" && req.url === "/refunds") return refund(req, res);
  res.writeHead(404).end();
}
EOF_5

cat >src/orders/orderService.js <<'EOF_6'
import { saveOrder, findOrder } from "./orderRepo.js";
import { charge } from "../payments/paymentService.js";

export async function placeOrder(req, res) {
  const order = await saveOrder({ status: "pending" });
  await charge(order);
  res.writeHead(201).end(JSON.stringify(order));
}

export async function markRefunded(orderId) {
  const order = await findOrder(orderId);
  return saveOrder({ ...order, status: "refunded" });
}
EOF_6

cat >src/orders/orderRepo.js <<'EOF_7'
import { pool } from "../db/pool.js";

export async function saveOrder(order) {
  const { rows } = await pool.query("INSERT INTO orders (status) VALUES ($1) RETURNING *", [order.status]);
  return rows[0];
}

export async function findOrder(id) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return rows[0];
}
EOF_7

cat >src/payments/paymentService.js <<'EOF_8'
import Stripe from "stripe";
import { markRefunded } from "../orders/orderService.js";

const stripe = new Stripe(process.env.STRIPE_KEY);

export async function charge(order) {
  return stripe.paymentIntents.create({ amount: order.totalCents, currency: "usd" });
}

export async function refund(req, res) {
  const { orderId, paymentIntent } = JSON.parse(req.body ?? "{}");
  await stripe.refunds.create({ payment_intent: paymentIntent });
  await markRefunded(orderId);
  res.writeHead(204).end();
}
EOF_8

cat >src/db/pool.js <<'EOF_9'
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
EOF_9

git init -q
git add -A
