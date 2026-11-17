#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved

cat >saved/gh-api-graphql-thread-9001.json <<'EOF_1'
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
            "author": {
              "login": "acme-bot"
            },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**issue (blocking):** `withRetry` retries 4xx responses, which can never succeed on a retry. Stop retrying when the status is below 500.",
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
EOF_2
