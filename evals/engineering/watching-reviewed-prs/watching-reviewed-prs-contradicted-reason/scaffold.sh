#!/usr/bin/env bash
set -euo pipefail

mkdir -p saved
cat >saved/gh-api-graphql-thread-9001.json <<'THREAD'
{
  "data": {
    "node": {
      "id": "PRRT_kwDOAcmeApi9001",
      "isResolved": false,
      "path": "src/handlers/upload.js",
      "comments": {
        "nodes": [
          {
            "id": "PRRC_kwDOAcmeApi9001",
            "author": { "login": "acme-bot" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9001",
            "body": "**issue (blocking):** the `catch` in `handleUpload` answers 200 with `{ ok: true }` and logs nothing, so a failed upload looks like a success to the client and leaves no trace for us. Return an error status and log the failure.",
            "reactionGroups": []
          },
          {
            "id": "PRRC_kwDOAcmeApi9011",
            "author": { "login": "acme-lee" },
            "url": "https://github.acme.invalid/acme/api/pull/9#discussion_r9011",
            "body": "Intentional for privacy: the storage error includes the user's access token.",
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
diff --git a/src/handlers/upload.js b/src/handlers/upload.js
new file mode 100644
index 0000000..4c6e8a0
--- /dev/null
+++ b/src/handlers/upload.js
@@ -0,0 +1,13 @@
+"use strict";
+const storage = require("../storage/client");
+
+async function handleUpload(req, res) {
+  try {
+    const object = await storage.putObject(req.user.accessToken, req.file);
+    res.status(201).json({ id: object.id });
+  } catch (error) {
+    res.status(200).json({ ok: true });
+  }
+}
+
+module.exports = { handleUpload };
diff --git a/src/storage/client.js b/src/storage/client.js
new file mode 100644
index 0000000..9e1f3b5
--- /dev/null
+++ b/src/storage/client.js
@@ -0,0 +1,22 @@
+"use strict";
+
+class StorageError extends Error {
+  constructor(status, statusText) {
+    super(`storage request failed: ${status} ${statusText}`);
+    this.name = "StorageError";
+    this.status = status;
+    this.statusText = statusText;
+  }
+}
+
+async function putObject(accessToken, file) {
+  const response = await fetch("https://storage.acme.invalid/objects", {
+    method: "PUT",
+    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.mimetype },
+    body: file.buffer,
+  });
+  if (!response.ok) throw new StorageError(response.status, response.statusText);
+  return response.json();
+}
+
+module.exports = { StorageError, putObject };
DIFF
