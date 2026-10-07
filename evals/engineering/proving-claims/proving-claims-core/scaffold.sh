#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/jobs
cat >src/jobs/store.js <<'EOF_1'
"use strict";

class JobStore {
  constructor(db) {
    this.db = db;
  }

  async load(id) {
    const { rows } = await this.db.query("SELECT * FROM jobs WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  async save(job) {
    await this.db.query(
      "INSERT INTO jobs (id, type, status, attempts, payload) VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (id) DO UPDATE SET status = $3, attempts = $4, payload = $5",
      [job.id, job.type, job.status, job.attempts, job.payload],
    );
  }

  async markDone(id) {
    const job = await this.load(id);
    job.status = "done";
    await this.save(job);
  }

  async markFailed(id, attempts) {
    const job = await this.load(id);
    job.status = "failed";
    job.attempts = attempts;
    await this.save(job);
  }
}

module.exports = { JobStore };
EOF_1

cat >src/jobs/retry.js <<'EOF_2'
"use strict";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 200;

async function withRetry(task, sleep) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task(attempt);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) {
        err.attempts = attempt;
        throw err;
      }
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

module.exports = { withRetry, MAX_ATTEMPTS, BASE_DELAY_MS };
EOF_2

cat >src/jobs/runner.js <<'EOF_3'
"use strict";

const { withRetry } = require("./retry");

async function runJob(store, handlers, id, sleep) {
  const job = await store.load(id);
  const handler = handlers[job.type];
  try {
    await withRetry((attempt) => handler(job.payload, attempt), sleep);
    await store.markDone(id);
  } catch (err) {
    await store.markFailed(id, err.attempts);
  }
}

module.exports = { runJob };
EOF_3

git init -q
git add -A
