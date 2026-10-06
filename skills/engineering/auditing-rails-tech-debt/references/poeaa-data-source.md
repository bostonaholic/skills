# PoEAA: Data Source Architectural Patterns

Source: the Data Source Architectural Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Table Data Gateway
- Row Data Gateway
- Active Record
- Data Mapper

## Table Data Gateway

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/tableDataGateway.html)): "An
  object that acts as a gateway to a database table. One instance handles all
  the rows in the table."
- **Rails relevance:** ActiveRecord's class-level query interface
  (`Order.where(...)`) plays this role. The smell is _bypassing_ the gateway
  with raw SQL scattered through the app, so table access is no longer
  centralized and schema changes fan out unpredictably.

**Before (smell: raw SQL for the same table scattered across controllers and
jobs):**

```ruby
# app/controllers/reports_controller.rb
rows = ActiveRecord::Base.connection.select_all(
  "SELECT * FROM orders WHERE status = 'paid' AND created_at > '#{30.days.ago}'"
)

# app/jobs/export_job.rb
rows = ActiveRecord::Base.connection.select_all("SELECT * FROM orders WHERE status = 'paid'")
```

**After (all access to the table through one gateway, the model's query
interface):**

```ruby
class Order < ApplicationRecord
  scope :paid, -> { where(status: "paid") }
  scope :recent, ->(since = 30.days.ago) { where(created_at: since..) }
end

Order.paid.recent   # controllers and jobs use the gateway
```

**Finding rule:** grep for `connection.select_all`, `connection.execute`, and
`find_by_sql` naming a table that has a model. Cite Table Data Gateway; add the
Rails Security Guide if strings are interpolated.

## Row Data Gateway

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/rowDataGateway.html)): "An
  object that acts as a gateway to a single record in a data source. There is
  one instance per row."
- **Rails relevance:** an ActiveRecord instance is a Row Data Gateway _plus_
  domain logic. The smell's shape: hand-rolled row wrappers around raw query
  results that duplicate what the model already provides, usually born from a
  performance workaround that then accretes logic.

**Before (smell: a hand-rolled row wrapper shadowing the model):**

```ruby
class OrderRow
  def initialize(row_hash)
    @row = row_hash
  end

  def total = @row["total"].to_d
  def paid? = @row["status"] == "paid"
end

rows = ActiveRecord::Base.connection.select_all("SELECT * FROM orders WHERE ...")
orders = rows.map { |row| OrderRow.new(row) }
```

**After (use the model; if the motivation was fewer columns, use `select`,
`pluck`, or `pick`):**

```ruby
orders = Order.paid.select(:id, :total, :status)
orders.first.paid?   # real model, real behavior, no duplicate wrapper
```

**Finding rule:** flag classes wrapping `select_all` hashes for tables that have
models. Cite Row Data Gateway and Active Record (the wrapper duplicates the
framework's own pattern).

## Active Record

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/activeRecord.html)): "An object
  that wraps a row in a database table or view, encapsulates the database
  access, and adds domain logic on that data."
- **Rails relevance:** the framework's namesake and core pattern. Fowler's
  stated limit: Active Record works when the domain logic maps 1:1 to the table
  structure, and it breaks down for complex logic spanning many tables. The
  smell is the **god model**: one ActiveRecord class absorbing the logic of a
  whole subsystem because "logic goes in models."

**Before (smell: a god model far past Active Record's carrying capacity):**

```ruby
class User < ApplicationRecord
  # 1,800 lines: authentication, billing, notification prefs, referral
  # program, CSV export, admin reporting, avatar processing, ...
  def charge_subscription!; ...; end
  def export_activity_csv; ...; end
  def process_avatar!; ...; end
  def referral_bonus_for(friend); ...; end
end
```

**After (Extract Class for concepts with their own table; a module function for
stateless logic that does not map to the users table):**

```ruby
class User < ApplicationRecord
  has_one :billing_account
  has_one :referral_account
end

class BillingAccount < ApplicationRecord
  def charge_subscription!; ...; end
end

module UserActivityExport
  module_function

  def to_csv(user); ...; end
end
```

**Finding rule:** flag ActiveRecord models over about 300 to 500 lines, or with
method clusters that share no table columns (measure cohesion: do methods use
the same attributes?). Cite Active Record's stated limits, SRP, and Extract
Class (refactoring.com).

## Data Mapper

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/dataMapper.html)): "A layer of
  mappers that moves data between objects and a database while keeping them
  independent of each other and the mapper itself."
- **Rails relevance:** Rails deliberately chose Active Record over Data Mapper;
  do **not** flag its absence. Data Mapper is the citation when a domain concept
  _deserves_ persistence independence and instead got welded to ActiveRecord:
  for example, a pure calculation or policy subclassing `ApplicationRecord` with
  no durable state to store, or a tableless hack.

**Before (smell: persistence bolted onto a pure calculation):**

```ruby
class ShippingQuote < ApplicationRecord
  # table exists only to hold intermediate calculation state;
  # rows are written, read once, and abandoned
  def self.for(order)
    create!(weight: order.weight, zone: order.zone, amount: compute(order))
  end
end
```

**After (compute on demand; persist only what the business must keep):**

```ruby
class Order < ApplicationRecord
  def shipping_quote
    RateTable.for(zone).price(weight)
  end
end
```

**Finding rule:** flag ActiveRecord subclasses whose tables hold no durable
business state (write-once scratch tables, or calculation caches better served
by `Rails.cache`). Cite Data Mapper (separation of domain from persistence) and
Domain Model.
