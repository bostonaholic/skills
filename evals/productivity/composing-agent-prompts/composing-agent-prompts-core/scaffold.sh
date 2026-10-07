#!/usr/bin/env bash
set -euo pipefail

cat >AGENTS.md <<'EOF_1'
# AGENTS.md

acme/helpdesk-bot answers customer billing questions in the Acme help widget.

## Commands

- Install: `npm ci`
- Test: `npm test` (runs `node --test`)
- Lint: `npm run lint`

## Rules

- Every change to `src/` ships with a test in `test/` that fails before the change.
- Add no runtime dependencies; `dependencies` in `package.json` stays empty.
- Customer-facing reply text lives in `src/replies.js`; never inline it elsewhere.
- Ticket references use the `ACME-<digits>` form that `formatTicket` in `src/replies.js` emits.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "@acme/helpdesk-bot",
  "version": "1.4.0",
  "private": true,
  "scripts": {
    "test": "node --test",
    "lint": "eslint src test"
  },
  "dependencies": {},
  "devDependencies": {
    "eslint": "9.12.0"
  }
}
EOF_2

mkdir -p src test
cat >src/replies.js <<'EOF_3'
'use strict';

const HANDOFF = 'A member of the billing team will reply within one business day.';

function formatTicket(id) {
  return `ACME-${id}`;
}

function handoffReply(ticketId) {
  return `${HANDOFF} Your ticket is ${formatTicket(ticketId)}.`;
}

module.exports = { formatTicket, handoffReply };
EOF_3

cat >test/replies.test.js <<'EOF_4'
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTicket, handoffReply } = require('../src/replies');

test('formatTicket prefixes the id', () => {
  assert.equal(formatTicket(42), 'ACME-42');
});

test('handoffReply names the ticket', () => {
  assert.match(handoffReply(42), /ACME-42/);
});
EOF_4

git init -q
git add -A
