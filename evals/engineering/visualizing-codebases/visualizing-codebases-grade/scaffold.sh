#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/http src/invoices src/customers src/domain src/persistence src/mail
cat >README.md <<'EOF_1'
# invoicing

The invoicing service. Finance staff use it over HTTPS. It stores invoices
and customers in PostgreSQL and sends invoice emails through an SMTP server.

invoicing is layered. Layers, outermost first: http (src/http), application (src/invoices, src/customers), domain (src/domain), infrastructure (src/persistence, src/mail). A layer imports only itself and the layers after it.

Express starts from `node src/http/server.js`.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "invoicing",
  "version": "3.0.2",
  "private": true,
  "type": "module",
  "main": "src/http/server.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node src/http/server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "nodemailer": "^6.9.0",
    "pg": "^8.13.0"
  }
}
EOF_2

cat >Dockerfile <<'EOF_3'
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/http/server.js"]
EOF_3

cat >src/http/server.js <<'EOF_4'
import express from "express";
import { invoiceRoutes } from "./invoiceRoutes.js";
import { customerRoutes } from "./customerRoutes.js";

const app = express();
app.use(express.json());
app.use("/invoices", invoiceRoutes);
app.use("/customers", customerRoutes);
app.listen(process.env.PORT ?? 3000);
EOF_4

cat >src/http/invoiceRoutes.js <<'EOF_5'
import express from "express";
import { createInvoice } from "../invoices/createInvoice.js";
import { sendInvoice } from "../invoices/sendInvoice.js";

export const invoiceRoutes = express.Router();

invoiceRoutes.post("/", async (req, res) => res.status(201).json(await createInvoice(req.body)));
invoiceRoutes.post("/:id/send", async (req, res) => res.status(202).json(await sendInvoice(req.params.id)));
EOF_5

cat >src/http/customerRoutes.js <<'EOF_6'
import express from "express";
import { registerCustomer } from "../customers/registerCustomer.js";

export const customerRoutes = express.Router();

customerRoutes.post("/", async (req, res) => res.status(201).json(await registerCustomer(req.body)));
EOF_6

cat >src/invoices/createInvoice.js <<'EOF_7'
import { buildInvoice } from "../domain/invoice.js";
import { saveInvoice } from "../persistence/invoiceRepo.js";
import { requireCustomer } from "../customers/customerLookup.js";

export async function createInvoice({ customerId, lines }) {
  const customer = await requireCustomer(customerId);
  const invoice = buildInvoice(customer, lines);
  return saveInvoice(invoice);
}
EOF_7

cat >src/invoices/sendInvoice.js <<'EOF_8'
import { findInvoice } from "../persistence/invoiceRepo.js";
import { deliver } from "../mail/smtpClient.js";

export async function sendInvoice(invoiceId) {
  const invoice = await findInvoice(invoiceId);
  await deliver(invoice.customer.email, `Invoice ${invoice.id}`, JSON.stringify(invoice));
  return { id: invoice.id, sent: true };
}

export async function reminderFor(invoiceId) {
  const invoice = await findInvoice(invoiceId);
  return deliver(invoice.customer.email, `Reminder for invoice ${invoice.id}`, "Payment is due.");
}
EOF_8

cat >src/customers/registerCustomer.js <<'EOF_9'
import { buildCustomer } from "../domain/customer.js";
import { saveCustomer } from "../persistence/customerRepo.js";

export async function registerCustomer({ name, email }) {
  return saveCustomer(buildCustomer(name, email));
}
EOF_9

cat >src/customers/customerLookup.js <<'EOF_10'
import { findCustomer } from "../persistence/customerRepo.js";
import { reminderFor } from "../invoices/sendInvoice.js";

export async function requireCustomer(customerId) {
  const customer = await findCustomer(customerId);
  if (!customer) throw new Error(`No customer ${customerId}`);
  return customer;
}

export async function remindOverdue(customerId, invoiceId) {
  await requireCustomer(customerId);
  return reminderFor(invoiceId);
}
EOF_10

cat >src/domain/invoice.js <<'EOF_11'
import { add, cents } from "./money.js";
import { isValidCustomer } from "./customer.js";

export function buildInvoice(customer, lines) {
  if (!isValidCustomer(customer)) throw new Error("Invalid customer");
  const total = lines.reduce((sum, line) => add(sum, cents(line.amountCents)), cents(0));
  return { customer, lines, total };
}
EOF_11

cat >src/domain/money.js <<'EOF_12'
export const cents = (value) => ({ cents: Math.round(value) });

export const add = (left, right) => cents(left.cents + right.cents);
EOF_12

cat >src/domain/customer.js <<'EOF_13'
export function buildCustomer(name, email) {
  return { name, email };
}

export function isValidCustomer(customer) {
  return Boolean(customer?.name) && /^[^@\s]+@[^@\s]+$/.test(customer.email ?? "");
}
EOF_13

cat >src/persistence/invoiceRepo.js <<'EOF_14'
import { pool } from "./pool.js";
import { buildInvoice } from "../domain/invoice.js";

export async function saveInvoice(invoice) {
  const { rows } = await pool.query("INSERT INTO invoices (customer_id, total_cents) VALUES ($1, $2) RETURNING *", [invoice.customer.id, invoice.total.cents]);
  return rows[0];
}

export async function findInvoice(id) {
  const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1", [id]);
  return rows[0] && buildInvoice(rows[0].customer, []);
}
EOF_14

cat >src/persistence/customerRepo.js <<'EOF_15'
import { pool } from "./pool.js";

export async function saveCustomer(customer) {
  const { rows } = await pool.query("INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING *", [customer.name, customer.email]);
  return rows[0];
}

export async function findCustomer(id) {
  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
  return rows[0];
}
EOF_15

cat >src/persistence/pool.js <<'EOF_16'
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
EOF_16

cat >src/mail/smtpClient.js <<'EOF_17'
import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 587 });

export async function deliver(to, subject, text) {
  return transport.sendMail({ from: "billing@invoicing.example", to, subject, text });
}
EOF_17

git init -q
git add -A
