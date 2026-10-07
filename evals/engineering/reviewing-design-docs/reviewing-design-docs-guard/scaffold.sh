#!/usr/bin/env bash
set -euo pipefail

mkdir -p src
cat >src/retry.py <<'EOF_1'
import time

MAX_ATTEMPTS = 5


def deliver_with_retry(send, payload, sleep=time.sleep):
    delay = 1
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if send(payload):
            return True
        if attempt < MAX_ATTEMPTS:
            sleep(delay)
            delay *= 2
    return False
EOF_1

cat >change.diff <<'EOF_2'
diff --git a/src/retry.py b/src/retry.py
--- a/src/retry.py
+++ b/src/retry.py
@@ -9,6 +9,6 @@ def deliver_with_retry(send, payload, sleep=time.sleep):
         if send(payload):
             return True
         if attempt < MAX_ATTEMPTS:
             sleep(delay)
-            delay *= 2
+            delay = min(delay * 2, MAX_DELAY_SECONDS)
     return False
EOF_2

git init -q
git add -A
