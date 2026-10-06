# PoEAA: Domain Logic Patterns

Source: the Domain Logic Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/). Each entry gives Fowler's
definition, the Rails mapping, the anti-pattern to hunt (before), and the
pattern-conforming refactoring (after).

## Contents

- Transaction Script
- Domain Model
- Table Module
- Service Layer

## Transaction Script

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/transactionScript.html)):
  "Organizes business logic by procedures where each procedure handles a single
  request from the presentation."
- **Rails relevance:** legitimate for simple apps. It becomes an anti-pattern
  when scripts grow conditional logic and duplicate each other; Fowler's own
  guidance is that Transaction Script stops paying off as domain complexity
  rises. In Rails the degenerate form is a 100-line controller action or rake
  task doing everything inline.

**Before (smell: a transaction script fused into the controller, duplicating
logic across actions):**

```ruby
class OrdersController < ApplicationController
  def create
    order = Order.new(order_params)
    order.total = order.line_items.sum { |item| item.price * item.quantity }
    order.total *= 0.9 if current_user.premium?
    if order.total > current_user.credit_limit
      render json: { error: "over limit" }, status: :unprocessable_entity and return
    end
    order.save!
    PaymentGateway.charge(current_user.card_token, order.total)
    OrderMailer.confirmation(order).deliver_later
    render json: order
  end
end
```

**After (a named procedure, which is what a Transaction Script is; push behavior
into the Domain Model when the logic is shared):**

```ruby
module Checkout
  module_function

  def place_order(user, order_params)
    order = Order.new(order_params)
    order.total = order.discounted_total_for(user)
    raise CreditLimitExceeded if order.total > user.credit_limit

    Order.transaction do
      order.save!
      PaymentGateway.charge(user.card_token, order.total)
    end
    OrderMailer.confirmation(order).deliver_later
    order
  end
end

# controller
render json: Checkout.place_order(current_user, order_params)
```

**Finding rule:** flag inline transaction scripts in controllers, jobs, and rake
tasks (cite Transaction Script and MVC). Flag _duplicated_ transaction scripts
as the signal to move to Domain Model; duplication between transactions is the
pattern's known failure mode.

## Domain Model

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/domainModel.html)): "An object
  model of the domain that incorporates both behavior and data."
- **Rails relevance:** ActiveRecord models _are_ the domain model. The classic
  violation is the
  [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html):
  models reduced to schema and associations while behavior lives in controllers,
  helpers, or "manager" classes that manipulate model attributes from outside.

**Before (smell: anemic model, behavior operated on from outside):**

```ruby
class Invoice < ApplicationRecord
  belongs_to :customer
  has_many :line_items
end

# elsewhere, in a controller or "manager"
if invoice.due_date < Date.current && !invoice.paid && invoice.reminders_sent < 3
  invoice.reminders_sent += 1
  invoice.last_reminded_at = Time.current
  invoice.save!
  InvoiceMailer.reminder(invoice).deliver_later
end
```

**After (behavior and data together):**

```ruby
class Invoice < ApplicationRecord
  belongs_to :customer
  has_many :line_items

  MAX_REMINDERS = 3

  def overdue?
    due_date < Date.current && !paid
  end

  def send_reminder
    return unless overdue? && reminders_sent < MAX_REMINDERS

    increment!(:reminders_sent, touch: :last_reminded_at)
    InvoiceMailer.reminder(self).deliver_later
  end
end
```

**Finding rule:** flag attribute-poking sequences
(`x.a = ...; x.b = ...; x.save!`) outside the model, and models with no domain
methods but heavy external manipulation. Cite Domain Model, Anemic Domain Model,
and Tell, Don't Ask.

## Table Module

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/tableModule.html)): "A single
  instance that handles the business logic for all rows in a database table or
  view."
- **Rails relevance:** Rails does not use Table Module (ActiveRecord is
  row-oriented), but the smell's shape appears as class-method-only models:
  every operation is `self.something(id)` taking IDs and returning hashes,
  forfeiting the benefits of both Domain Model and ActiveRecord.

**Before (smell: accidental Table Module, IDs and hashes instead of objects):**

```ruby
class Subscription < ApplicationRecord
  def self.renewal_price(subscription_id)
    row = find(subscription_id)
    { amount: row.base_price * (row.annual? ? 10 : 1), currency: "USD" }
  end

  def self.cancel(subscription_id)
    update(subscription_id, status: "canceled", canceled_at: Time.current)
  end
end
```

**After (instance behavior on the domain object):**

```ruby
class Subscription < ApplicationRecord
  def renewal_price
    Money.new(base_price * (annual? ? 10 : 1), "USD")
  end

  def cancel!
    update!(status: "canceled", canceled_at: Time.current)
  end
end
```

**Finding rule:** flag models whose public API is mostly class methods taking
IDs. Cite Table Module (to name what the code accidentally is) and Domain Model
(the Rails-appropriate target).

## Service Layer

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/serviceLayer.html)): "Defines an
  application's boundary with a layer of services that establishes a set of
  available operations and coordinates the application's response in each
  operation."
- **Rails relevance:** `app/services`. Two opposite smells:
  1. **Missing Service Layer:** multi-model orchestration (transactions,
     external calls, notifications) embedded in controllers or model callbacks.
  2. **Degenerate Service Layer:** services that contain _all_ domain logic,
     re-anemizing the models. Fowler's service layer is thin and coordinating,
     with domain logic in the Domain Model.
- **Shape:** in Ruby a service layer can be modules of functions. Make an
  operation a class only when it holds state or orchestrates several models,
  and say why a module function would not do; a stateless class with one `call`
  method adds a layer without adding behavior.

**Before (smell 1: orchestration in a callback, with hidden coupling that fires
on every save path, including tests and backfills):**

```ruby
class Order < ApplicationRecord
  after_save :charge_and_notify

  private

  def charge_and_notify
    return unless saved_change_to_status? && confirmed?

    PaymentGateway.charge(user.card_token, total)
    Inventory.decrement!(line_items)
    OrderMailer.confirmation(self).deliver_later
  end
end
```

**After (an explicit application operation; models keep their own invariants):**

```ruby
module Fulfillment
  module_function

  def confirm_order(order)
    Order.transaction do
      order.confirm!                          # domain logic stays on the model
      Inventory.decrement!(order.line_items)
    end
    PaymentGateway.charge(order.user.card_token, order.total)
    OrderMailer.confirmation(order).deliver_later
  end
end
```

**Before (smell 2: a service hoarding domain logic):**

```ruby
class OrderService
  def self.total(order)
    order.line_items.sum { |item| item.price * item.quantity } * (order.user.premium? ? 0.9 : 1.0)
  end
end
```

**After:** move `total` onto `Order`; keep the service layer for cross-boundary
coordination only.

**Finding rule:** flag multi-model writes plus external side effects in
controllers or callbacks (cite Service Layer and the thoughtbot callback
guidelines). Flag services computing single-model derivations (cite Service
Layer's thin-layer guidance and Anemic Domain Model).
