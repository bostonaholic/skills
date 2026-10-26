#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved
cat >saved/gh-api-graphql-thread-9001.json <<'THREAD'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9001",
      "isResolved": false,
      "path": "src/http/pagination.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9001",
            "author": { "login": "acme-bot" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**issue (blocking):** `parseLimit` has no lower bound, so `?limit=-5` reaches the SQL `LIMIT` in `listOrders` and the query fails. Reject or clamp values below 1.",
            "reactionGroups": []
          },
          {
            "id": "PRRC_kwDOAcmeApi9011",
            "author": { "login": "acme-lee" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9011",
            "body": "Agreed. I will fix this in a follow-up PR.",
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
diff --git a/src/http/pagination.js b/src/http/pagination.js
new file mode 100644
index 0000000..5b7c9d1
--- /dev/null
+++ b/src/http/pagination.js
@@ -0,0 +1,10 @@
+"use strict";
+
+const DEFAULT_LIMIT = 50;
+
+function parseLimit(raw) {
+  if (raw === undefined) return DEFAULT_LIMIT;
+  return Number(raw);
+}
+
+module.exports = { DEFAULT_LIMIT, parseLimit };
diff --git a/src/routes/orders.js b/src/routes/orders.js
new file mode 100644
index 0000000..2e4f6a8
--- /dev/null
+++ b/src/routes/orders.js
@@ -0,0 +1,11 @@
+"use strict";
+const db = require("../db");
+const { parseLimit } = require("../http/pagination");
+
+async function listOrders(req, res) {
+  const limit = parseLimit(req.query.limit);
+  const rows = await db.query("SELECT id, total_cents FROM orders ORDER BY id LIMIT $1", [limit]);
+  res.json(rows);
+}
+
+module.exports = { listOrders };
DIFF
