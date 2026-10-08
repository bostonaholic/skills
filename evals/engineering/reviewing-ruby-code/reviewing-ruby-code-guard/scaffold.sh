#!/usr/bin/env bash
set -euo pipefail

mkdir -p config app/models app/services app/jobs app/mailers

cat >Gemfile <<'EOF_1'
source "https://gems.acme.invalid"

ruby "3.3.5"

gem "rails", "~> 7.2"
gem "pg", "~> 1.5"
gem "puma", "~> 6.4"
EOF_1

cat >config/application.rb <<'EOF_2'
require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module AcmeBilling
  class Application < Rails::Application
    config.load_defaults 7.2
  end
end
EOF_2

cat >app/models/application_record.rb <<'EOF_3'
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
EOF_3

cat >app/models/invoice.rb <<'EOF_4'
class Invoice < ApplicationRecord
  belongs_to :customer

  enum :status, { draft: 0, sent: 1, paid: 2 }

  validates :number, presence: true, uniqueness: true

  def overdue?(today = Date.current)
    sent? && due_on < today
  end
end
EOF_4

cat >app/services/invoice_reminder.rb <<'EOF_5'
class InvoiceReminder
  def initialize(invoice)
    @invoice = invoice
  end

  def call
    return unless @invoice.overdue?

    InvoiceMailer.with(invoice: @invoice).reminder.deliver_later
  end
end
EOF_5

cat >app/jobs/send_invoice_reminders_job.rb <<'EOF_6'
class SendInvoiceRemindersJob < ApplicationJob
  queue_as :default

  def perform
    Invoice.sent.find_each { |invoice| InvoiceReminder.new(invoice).call }
  end
end
EOF_6

cat >app/mailers/invoice_mailer.rb <<'EOF_7'
class InvoiceMailer < ApplicationMailer
  def reminder
    @invoice = params[:invoice]
    mail(to: @invoice.customer.email, subject: "Invoice #{@invoice.number} is overdue")
  end
end
EOF_7

git init -q
git add -A
