#!/usr/bin/env bash
set -euo pipefail

mkdir -p config db app/models app/controllers app/views/orders test/models

cat >Gemfile <<'EOF_1'
source "https://gems.acme.invalid"

ruby "3.3.4"

gem "rails", "~> 7.0.8"
gem "pg", "~> 1.5"
gem "puma", ">= 5.0"

group :development, :test do
  gem "debug", platforms: %i[mri windows]
end
EOF_1

cat >config/routes.rb <<'EOF_2'
Rails.application.routes.draw do
  resources :orders, only: :index
  root "orders#index"
end
EOF_2

cat >db/schema.rb <<'EOF_3'
ActiveRecord::Schema[7.0].define(version: 2026_09_14_120000) do
  enable_extension "plpgsql"

  create_table "customers", force: :cascade do |t|
    t.string "name", null: false
    t.string "email", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_customers_on_email", unique: true
  end

  create_table "orders", force: :cascade do |t|
    t.bigint "customer_id", null: false
    t.string "status", default: "pending", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["customer_id"], name: "index_orders_on_customer_id"
    t.index ["created_at"], name: "index_orders_on_created_at"
  end

  add_foreign_key "orders", "customers"
end
EOF_3

cat >app/models/application_record.rb <<'EOF_4'
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
EOF_4

cat >app/models/customer.rb <<'EOF_5'
class Customer < ApplicationRecord
  has_many :orders, dependent: :restrict_with_error

  before_validation :normalize_email

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true

  private

  def normalize_email
    self.email = email.to_s.strip.downcase
  end
end
EOF_5

cat >app/models/order.rb <<'EOF_6'
class Order < ApplicationRecord
  STATUSES = %w[pending paid shipped].freeze

  belongs_to :customer

  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(created_at: :desc) }
end
EOF_6

cat >app/controllers/application_controller.rb <<'EOF_7'
class ApplicationController < ActionController::Base
end
EOF_7

cat >app/controllers/orders_controller.rb <<'EOF_8'
class OrdersController < ApplicationController
  def index
    @orders = Order.recent.limit(50)
  end
end
EOF_8

cat >app/views/orders/index.html.erb <<'EOF_9'
<h1>Recent orders</h1>

<table>
  <thead>
    <tr><th>Order</th><th>Customer</th><th>Status</th><th>Placed</th></tr>
  </thead>
  <tbody>
    <% @orders.each do |order| %>
      <tr>
        <td>#<%= order.id %></td>
        <td><%= order.customer.name %></td>
        <td><%= order.status %></td>
        <td><%= order.created_at.to_date %></td>
      </tr>
    <% end %>
  </tbody>
</table>
EOF_9

cat >test/models/customer_test.rb <<'EOF_10'
require "test_helper"

class CustomerTest < ActiveSupport::TestCase
  test "normalizes email before validation" do
    customer = Customer.new(name: "Ada", email: "  Ada@Acme.Invalid ")
    customer.valid?
    assert_equal "ada@acme.invalid", customer.email
  end
end
EOF_10

git init -q
git add -A
