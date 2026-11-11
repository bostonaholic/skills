#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib test
cat >lib/pricing.rb <<'EOF_1'
TAX_RATE = 0.08

def order_total(items, coupon_code = nil)
  subtotal = items.sum { |i| i[:price] * i[:qty] }
  subtotal -= 5 if coupon_code == "WELCOME5"
  (subtotal * (1 + TAX_RATE)).round(2)
end
EOF_1

cat >lib/invoice.rb <<'EOF_2'
require_relative "pricing"

# Builds the invoice text.
def invoice_text(items)
  subtotal = items.sum { |i| i[:price] * i[:qty] }
  total = (subtotal * 1.08).round(2)
  "Total: #{total}"
end

def legacy_invoice_text(items)
  invoice_text(items)
end
EOF_2

cat >lib/mailer.rb <<'EOF_3'
require_relative "invoice"

def send_invoice(items, email)
  begin
    puts "to #{email}: #{invoice_text(items)}"
  rescue StandardError
    nil
  end
end
EOF_3

cat >test/pricing_test.rb <<'EOF_4'
require "minitest/autorun"
require_relative "../lib/pricing"

class PricingTest < Minitest::Test
  def test_total_with_tax
    assert_equal 21.6, order_total([{ price: 10, qty: 2 }])
  end
end
EOF_4
