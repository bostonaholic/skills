#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved
cat >saved/gh-api-graphql-thread-9001.json <<'THREAD'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9001",
      "isResolved": false,
      "path": "src/reports/summary.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9001",
            "author": { "login": "acme-bot" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**suggestion (non-blocking):** `buildSummary(accountId)` reads the ledger on every request. Cache each account's summary in a module-level `Map` so repeat views skip the ledger read.",
            "reactionGroups": []
          },
          {
            "id": "PRRC_kwDOAcmeApi9011",
            "author": { "login": "acme-lee" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9011",
            "body": "I'd rather not cache this. The summary has to show a transfer the moment it lands: `src/routes/transfers.js` calls `buildSummary` right after `ledger.transfer(...)` and sends the result to the client, and nothing would clear a module-level `Map` when a balance changes, so a cached summary would show the old balance.",
            "reactionGroups": [
              { "content": "THUMBS_UP", "viewerHasReacted": false },
              { "content": "THUMBS_DOWN", "viewerHasReacted": false }
            ]
          }
        ]
      }
    }
  }
}
THREAD

cat >saved/gh-pr-diff-9.txt <<'DIFF'
diff --git a/src/reports/summary.js b/src/reports/summary.js
new file mode 100644
index 0000000..3f6a1c2
--- /dev/null
+++ b/src/reports/summary.js
@@ -0,0 +1,14 @@
+"use strict";
+const ledger = require("../ledger");
+
+function buildSummary(accountId) {
+  const balances = ledger.balances(accountId);
+  return {
+    accountId,
+    availableCents: balances.availableCents,
+    pendingCents: balances.pendingCents,
+    updatedAt: new Date().toISOString(),
+  };
+}
+
+module.exports = { buildSummary };
diff --git a/src/routes/transfers.js b/src/routes/transfers.js
new file mode 100644
index 0000000..8d2e4b7
--- /dev/null
+++ b/src/routes/transfers.js
@@ -0,0 +1,17 @@
+"use strict";
+const express = require("express");
+const ledger = require("../ledger");
+const { buildSummary } = require("../reports/summary");
+
+const router = express.Router();
+
+router.post("/accounts/:accountId/transfers", async (req, res) => {
+  const { accountId } = req.params;
+  const { toAccountId, amountCents } = req.body;
+
+  await ledger.transfer({ from: accountId, to: toAccountId, amountCents });
+  res.set("Cache-Control", "no-store");
+  res.status(201).json(buildSummary(accountId));
+});
+
+module.exports = router;
DIFF
