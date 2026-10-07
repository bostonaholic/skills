#!/usr/bin/env bash
set -euo pipefail

mkdir -p .agents/friction-log/20260921093015-mcp-bridge-sleep
cat >.agents/friction-log/20260921093015-mcp-bridge-sleep/friction.md <<'EOF_1'
---
title: "MCP bridge drops its connection after laptop sleep"
severity: major
target: acme/mcp-bridge
---

After the laptop wakes, every MCP tool call fails until the bridge is restarted by hand. Suggested fix: reconnect on the first failed call.
EOF_1

mkdir -p .agents/friction-log/20260814161202-zsh-startup
cat >.agents/friction-log/20260814161202-zsh-startup/friction.md <<'EOF_2'
---
title: "New zsh shells take two seconds to start"
severity: minor
---

Each new terminal tab waits about two seconds on version-manager init. Suggested fix: lazy-load the version manager.
EOF_2

mkdir -p api-server/.agents/friction-log/20260929110431-test-db-dirty
cat >api-server/.agents/friction-log/20260929110431-test-db-dirty/friction.md <<'EOF_3'
---
title: "Integration tests leave the test database dirty"
severity: blocker
---

A failed integration run leaves rows behind, so the next run fails on unique constraints until the database is dropped by hand. Suggested fix: wrap each test in a rolled-back transaction.
EOF_3

mkdir -p api-server/.agents/friction-log/20260917084510-seed-ruby-version
cat >api-server/.agents/friction-log/20260917084510-seed-ruby-version/friction.md <<'EOF_4'
---
title: "Seed script needs a Ruby version the repo does not pin"
severity: major
---

bin/seed fails on the Ruby the repo installs because it uses a newer pattern-matching form. Suggested fix: pin the Ruby version in .ruby-version.
EOF_4

mkdir -p api-server/.agents/friction-log/20260902150322-lint-all-files
cat >api-server/.agents/friction-log/20260902150322-lint-all-files/friction.md <<'EOF_5'
---
title: "Pre-commit lint runs on every file, not staged ones"
severity: minor
---

Every commit waits about forty seconds while lint checks the whole tree.
EOF_5

mkdir -p web-app/.agents/friction-log/20260925143355-storybook-port
cat >web-app/.agents/friction-log/20260925143355-storybook-port/friction.md <<'EOF_6'
---
title: "Storybook and the dev server both claim port 6006"
severity: minor
---

Starting both fails with EADDRINUSE until one is given another port by hand. Suggested fix: move Storybook to 6007.
EOF_6

mkdir -p web-app/.agents/friction-log/20260911101817-env-example-stale
cat >web-app/.agents/friction-log/20260911101817-env-example-stale/friction.md <<'EOF_7'
---
title: ".env.example is missing PAYMENTS_WEBHOOK_SECRET"
severity: major
---

A fresh checkout boots, then every checkout request fails with a signature error. Suggested fix: add the variable to .env.example with a placeholder.
EOF_7

mkdir -p docs-site/.agents/friction-log

git init -q
git add -A
