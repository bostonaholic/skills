#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved

cat >saved/gh-api-graphql-thread-9002.json <<'EOF_1'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9002",
      "isResolved": false,
      "path": "src/cache.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9002",
            "author": {
              "login": "acme-bot"
            },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9002",
            "body": "**issue (blocking):** `ttlMs` is in milliseconds, but `client.setex` takes seconds, so every entry lives 1,000 times longer than intended. Pass the TTL in seconds.",
            "reactionGroups": []
          },
          {
            "id": "PRRC_kwDOAcmeApi9012",
            "author": {
              "login": "acme-lee"
            },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9012",
            "body": "Fixed, the TTL is in seconds now.",
            "reactionGroups": [
              {
                "content": "THUMBS_UP",
                "viewerHasReacted": false
              },
              {
                "content": "THUMBS_DOWN",
                "viewerHasReacted": false
              }
            ]
          },
          {
            "id": "PRRC_kwDOAcmeApi9022",
            "author": {
              "login": "acme-bot"
            },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9022",
            "body": "**issue (blocking):** The branch does not bear out the fix: `put` in `src/cache.js` still passes `ttlMs` to `client.setex`. Converting the TTL to seconds before the call would settle this.",
            "reactionGroups": []
          }
        ]
      }
    }
  }
}
EOF_1

cat >saved/gh-pr-diff-9.txt <<'EOF_2'
diff --git a/src/http/retry.js b/src/http/retry.js
new file mode 100644
index 0000000..7a8b9c0
--- /dev/null
+++ b/src/http/retry.js
@@ -0,0 +1,17 @@
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
+module.exports = { withRetry };
diff --git a/src/cache.js b/src/cache.js
new file mode 100644
index 0000000..3c4d5e6
--- /dev/null
+++ b/src/cache.js
@@ -0,0 +1,10 @@
+"use strict";
+
+const DEFAULT_TTL_MS = 60000;
+
+async function put(client, key, value, ttlMs = DEFAULT_TTL_MS) {
+  // Entries expire after ttlMs.
+  await client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
+}
+
+module.exports = { put, DEFAULT_TTL_MS };
EOF_2

cat >saved/gh-api-compare-9.diff <<'EOF_3'
diff --git a/src/cache.js b/src/cache.js
--- a/src/cache.js
+++ b/src/cache.js
@@ -4,6 +4,6 @@ const DEFAULT_TTL_MS = 60000;
 async function put(client, key, value, ttlMs = DEFAULT_TTL_MS) {
   // Entries expire after ttlMs.
-  await client.setex(key, ttlMs, JSON.stringify(value));
+  await client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
 }
EOF_3
