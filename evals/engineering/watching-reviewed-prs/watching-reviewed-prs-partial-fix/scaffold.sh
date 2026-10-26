#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved
cat >saved/gh-api-graphql-thread-9001.json <<'THREAD'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9001",
      "isResolved": false,
      "path": "src/http/retry.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9001",
            "author": { "login": "acme-bot" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**issue (blocking):** `withRetry` retries 4xx responses, which will never succeed on a retry, and it retries immediately with no wait between attempts, so a struggling upstream gets three requests at once. Stop retrying 4xx, and add a backoff delay between attempts.",
            "reactionGroups": []
          },
          {
            "id": "PRRC_kwDOAcmeApi9011",
            "author": { "login": "acme-lee" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9011",
            "body": "Fixed in the latest push: 4xx responses no longer retry.",
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
diff --git a/src/http/retry.js b/src/http/retry.js
new file mode 100644
index 0000000..7a8b9c0
--- /dev/null
+++ b/src/http/retry.js
@@ -0,0 +1,18 @@
+"use strict";
+
+const MAX_ATTEMPTS = 3;
+
+async function withRetry(operation) {
+  let lastError;
+  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
+    try {
+      return await operation();
+    } catch (error) {
+      if (error.status < 500) throw error;
+      lastError = error;
+    }
+  }
+  throw lastError;
+}
+
+module.exports = { withRetry };
DIFF

cat >saved/gh-api-compare-9.diff <<'COMPARE'
diff --git a/src/http/retry.js b/src/http/retry.js
index 3c4d5e6..7a8b9c0 100644
--- a/src/http/retry.js
+++ b/src/http/retry.js
@@ -8,6 +8,7 @@ async function withRetry(operation) {
     try {
       return await operation();
     } catch (error) {
+      if (error.status < 500) throw error;
       lastError = error;
     }
   }
COMPARE
