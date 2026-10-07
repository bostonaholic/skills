#!/usr/bin/env bash
set -euo pipefail

mkdir -p docs
cat >docs/diagram.mmd <<'EOF_1'
flowchart TD
    start([Order received]) --> validate{Valid order?}
    validate -->|yes| reserve[Reserve stock (warehouse)]
    validate -->|no| reject[Reject order]
    reserve --> charge[Charge card]
    charge --> ship[Create shipment]
    ship --> end
    reject --> end
EOF_1

git init -q
git add -A
