#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/acme_billing test

cat >pyproject.toml <<'EOF_1'
[project]
name = "acme-billing"
version = "0.4.0"
requires-python = ">=3.11"

[project.optional-dependencies]
test = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["test"]
pythonpath = ["src"]
EOF_1

cat >src/acme_billing/__init__.py <<'EOF_2'
"""Billing arithmetic for Acme invoices, in integer cents."""
EOF_2

cat >src/acme_billing/pricing.py <<'EOF_3'
def apply_discount(subtotal_cents, percent):
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    return subtotal_cents - subtotal_cents * percent // 100
EOF_3

cat >src/acme_billing/invoice.py <<'EOF_4'
from acme_billing.pricing import apply_discount


def invoice_total(lines, discount_percent=0):
    subtotal = sum(quantity * unit_cents for quantity, unit_cents in lines)
    return apply_discount(subtotal, discount_percent)
EOF_4

cat >test/test_pricing.py <<'EOF_5'
import pytest

from acme_billing.pricing import apply_discount


def test_apply_discount_reduces_subtotal():
    assert apply_discount(999, 15) == 850


def test_apply_discount_rejects_percent_over_100():
    with pytest.raises(ValueError):
        apply_discount(1000, 101)
EOF_5

cat >test/test_invoice.py <<'EOF_6'
from acme_billing.invoice import invoice_total


def test_invoice_total_sums_line_amounts():
    assert invoice_total([(2, 500), (1, 250)]) == 1250


def test_invoice_total_adds_each_line():
    assert invoice_total([(3, 100), (1, 50)]) == 350


def test_invoice_total_applies_discount():
    assert invoice_total([(2, 500)], discount_percent=10) == 900
EOF_6

git init -q
git add -A
