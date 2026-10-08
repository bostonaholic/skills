#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/webhooks

cat >package.json <<'EOF_1'
{
  "name": "@acme/storefront-api",
  "version": "1.4.0",
  "private": true,
  "main": "src/orders.js",
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

cat >src/orders.js <<'EOF_2'
const { enqueueEvent } = require("./webhooks");

function markPaid(order, now = Date.now()) {
  order.status = "paid";
  enqueueEvent(
    {
      id: `evt_${order.id}_paid`,
      type: "order.paid",
      data: { orderId: order.id, total: order.total },
    },
    now,
  );
  return order;
}

module.exports = { markPaid };
EOF_2

cat >src/webhooks/index.js <<'EOF_3'
const { subscriptionsFor } = require("./subscriptions");
const queue = require("./queue");

function enqueueEvent(event, now = Date.now()) {
  const subs = subscriptionsFor(event.type);
  for (const sub of subs) {
    queue.push({
      id: `${event.id}:${sub.id}`,
      event,
      subscription: sub,
      attempt: 0,
      runAt: now,
    });
  }
  return subs.length;
}

module.exports = { enqueueEvent };
EOF_3

cat >src/webhooks/subscriptions.js <<'EOF_4'
const SUBSCRIPTIONS = [
  {
    id: "sub_1",
    url: "https://hooks.acme.invalid/orders",
    secret: "whsec_test_1",
    events: ["order.created", "order.paid"],
  },
  {
    id: "sub_2",
    url: "https://erp.acme.invalid/inbound",
    secret: "whsec_test_2",
    events: ["order.paid"],
  },
];

function subscriptionsFor(eventType) {
  return SUBSCRIPTIONS.filter((s) => s.events.includes(eventType));
}

module.exports = { subscriptionsFor };
EOF_4

cat >src/webhooks/queue.js <<'EOF_5'
const jobs = [];
const deadLetters = [];

function push(job) {
  jobs.push(job);
}

function takeDue(now) {
  const due = jobs.filter((j) => j.runAt <= now);
  for (const j of due) jobs.splice(jobs.indexOf(j), 1);
  return due;
}

function deadLetter(job, reason) {
  deadLetters.push({ job, reason });
}

module.exports = { push, takeDue, deadLetter, deadLetters };
EOF_5

cat >src/webhooks/sign.js <<'EOF_6'
const crypto = require("node:crypto");

function signatureHeader(secret, body, timestampSeconds) {
  const mac = crypto
    .createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

module.exports = { signatureHeader };
EOF_6

cat >src/webhooks/deliver.js <<'EOF_7'
const { signatureHeader } = require("./sign");

async function deliver(job, fetchImpl, now) {
  const body = JSON.stringify(job.event);
  const timestamp = Math.floor(now / 1000);
  const res = await fetchImpl(job.subscription.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "acme-signature": signatureHeader(job.subscription.secret, body, timestamp),
    },
    body,
  });
  return res.status;
}

module.exports = { deliver };
EOF_7

cat >src/webhooks/retry.js <<'EOF_8'
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;

// An undefined status means the request never got a response.
function isRetryable(status) {
  return status === undefined || status >= 500;
}

function backoffMs(attempt) {
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

module.exports = { MAX_ATTEMPTS, backoffMs, isRetryable };
EOF_8

cat >src/webhooks/worker.js <<'EOF_9'
const queue = require("./queue");
const { deliver } = require("./deliver");
const { MAX_ATTEMPTS, backoffMs, isRetryable } = require("./retry");

async function runOnce(fetchImpl, now = Date.now()) {
  for (const job of queue.takeDue(now)) {
    job.attempt += 1;
    let status;
    try {
      status = await deliver(job, fetchImpl, now);
    } catch {
      status = undefined;
    }
    if (status >= 200 && status < 300) continue;
    if (!isRetryable(status)) {
      queue.deadLetter(job, `status ${status}`);
    } else if (job.attempt >= MAX_ATTEMPTS) {
      queue.deadLetter(job, "max attempts");
    } else {
      job.runAt = now + backoffMs(job.attempt);
      queue.push(job);
    }
  }
}

module.exports = { runOnce };
EOF_9

git init -q
git add -A
