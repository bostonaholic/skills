#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/auth src/routes test/auth
cat >package.json <<'EOF_1'
{
  "name": "acme-admin",
  "version": "4.2.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
EOF_1

cat >src/auth/require-role.js <<'EOF_2'
"use strict";

function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      res.sendStatus(401);
      return;
    }
    const held = new Set(req.user.roles);
    if (!roles.some((role) => held.has(role))) {
      res.sendStatus(403);
      return;
    }
    next();
  };
}

module.exports = { requireRole };
EOF_2

cat >src/auth/authenticate.js <<'EOF_3'
"use strict";

module.exports = function authenticate(req, res, next) {
  const session = req.session;
  if (!session || !session.user) {
    next();
    return;
  }
  const roles = [...session.user.roles];
  if (session.mfaPassed) {
    roles.push("mfa-verified");
  }
  req.user = { id: session.user.id, roles };
  next();
};
EOF_3

cat >src/routes/admin.js <<'EOF_4'
"use strict";

const express = require("express");
const authenticate = require("../auth/authenticate");
const { requireRole } = require("../auth/require-role");

const router = express.Router();
router.use(authenticate);

router.delete("/users/:id", requireRole("admin", "mfa-verified"), (req, res) => {
  req.app.locals.users.delete(req.params.id);
  res.sendStatus(204);
});

module.exports = router;
EOF_4

cat >src/routes/reports.js <<'EOF_5'
"use strict";

const express = require("express");
const authenticate = require("../auth/authenticate");
const { requireRole } = require("../auth/require-role");

const router = express.Router();
router.use(authenticate);

router.get("/reports/monthly", requireRole("analyst"), (req, res) => {
  res.json(req.app.locals.reports.monthly());
});

module.exports = router;
EOF_5

cat >test/auth/require-role.test.js <<'EOF_6'
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireRole } = require("../../src/auth/require-role");

function run(middleware, user) {
  const result = { status: null, nextCalled: false };
  const res = { sendStatus: (code) => (result.status = code) };
  middleware({ user }, res, () => (result.nextCalled = true));
  return result;
}

test("rejects a request with no user", () => {
  assert.equal(run(requireRole("analyst"), undefined).status, 401);
});

test("rejects a user without the role", () => {
  assert.equal(run(requireRole("analyst"), { roles: ["viewer"] }).status, 403);
});

test("admits a user with the role", () => {
  assert.equal(run(requireRole("analyst"), { roles: ["analyst"] }).nextCalled, true);
});

test("admits a user who holds one of the listed roles", () => {
  assert.equal(run(requireRole("editor", "publisher"), { roles: ["publisher"] }).nextCalled, true);
});
EOF_6

git init -q
git add -A
