#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved
cat >saved/gh-api-graphql-thread-9001.json <<'THREAD'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9001",
      "isResolved": true,
      "path": "src/http/client.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9001",
            "author": { "login": "acme-bot" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**suggestion (non-blocking):** `fetchJson` waits 30 seconds before it times out. A 10-second timeout would let the dashboard show its error state sooner.",
            "reactionGroups": []
          }
        ]
      }
    }
  }
}
THREAD

cat >saved/gh-pr-diff-9.txt <<'DIFF'
diff --git a/src/routes/health.js b/src/routes/health.js
index 4d5e6f7..8a9b0c1 100644
--- a/src/routes/health.js
+++ b/src/routes/health.js
@@ -1,5 +1,6 @@
 "use strict";
 function health(req, res) {
-  res.json({ ok: true });
+  res.set("Cache-Control", "no-store");
+  res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
 }
 module.exports = { health };
DIFF
