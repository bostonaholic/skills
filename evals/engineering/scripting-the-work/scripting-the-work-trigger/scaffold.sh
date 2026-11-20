#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib/billing lib/billing/adapters
cat >lib/billing.rb <<'EOF_1'
# frozen_string_literal: true

require_relative "billing/invoice"
require_relative "billing/tax"

module Billing
end
EOF_1

cat >lib/billing/invoice.rb <<'EOF_2'
module Billing
  class Invoice
    attr_reader :lines

    def initialize(lines)
      @lines = lines
    end

    def total_cents
      lines.sum(&:amount_cents)
    end
  end
end
EOF_2

cat >lib/billing/tax.rb <<'EOF_3'
module Billing
  module Tax
    RATE = 0.0625

    def self.on(cents)
      (cents * RATE).round
    end
  end
end
EOF_3

cat >lib/billing/adapters/stripe.rb <<'EOF_4'
# frozen_string_literal: true

module Billing
  module Adapters
    class Stripe
      def charge(invoice)
        { amount: invoice.total_cents, currency: "usd" }
      end
    end
  end
end
EOF_4

cat >lib/billing/adapters/csv_export.rb <<'EOF_5'
require "csv"

module Billing
  module Adapters
    class CsvExport
      def call(invoices)
        CSV.generate { |csv| invoices.each { |invoice| csv << [invoice.total_cents] } }
      end
    end
  end
end
EOF_5

git init -q
git add -A
