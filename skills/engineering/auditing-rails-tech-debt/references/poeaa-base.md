# PoEAA: Base Patterns

Source: the Base Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Gateway
- Service Stub
- Record Set
- Mapper
- Layer Supertype
- Separated Interface
- Registry
- Value Object
- Money
- Special Case
- Plugin

## Gateway

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/gateway.html)):
  "An object that encapsulates access to an external system or resource."
- **Rails relevance:** the most-violated base pattern. Smell: HTTP clients, SDK
  calls, and API keys scattered through models, jobs, and controllers, so access
  is untestable and unswappable, and every timeout and retry decision is
  duplicated.

**Before (smell: external access inline, everywhere):**

```ruby
class Order < ApplicationRecord
  def notify_slack!
    Net::HTTP.post(URI("https://hooks.slack.com/services/#{ENV['SLACK_HOOK']}"),
                   { text: "Order #{id} placed" }.to_json,
                   "Content-Type" => "application/json")
  end
end
# ...another Net::HTTP.post to Slack in RefundJob, another in SignupsController
```

**After (one gateway owns the protocol, configuration, errors, and retries):**

```ruby
class SlackGateway
  Error = Class.new(StandardError)

  def initialize(webhook_url: Rails.application.credentials.slack_webhook_url)
    @webhook_url = webhook_url
  end

  def post(text)
    response = Net::HTTP.post(URI(@webhook_url), { text: }.to_json, "Content-Type" => "application/json")
    raise Error, response.body unless response.is_a?(Net::HTTPSuccess)
  end
end
```

A class fits here: the gateway holds its endpoint configuration, and tests
substitute a fake for it (see Service Stub).

**Finding rule:** grep for `Net::HTTP`, `Faraday`, `HTTParty`, and SDK constants
(`Stripe::`, `Aws::`) outside a dedicated gateway or client layer. Cite Gateway.

## Service Stub

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/serviceStub.html)): "Removes
  dependence upon problematic services during testing."
- **Rails relevance:** test suites that hit real external services (flaky, slow,
  rate-limited), or stub at the HTTP-string level everywhere because no Gateway
  seam exists.

**Before (smell: raw HTTP stubs sprayed across specs):**

```ruby
it "notifies slack" do
  stub_request(:post, %r{hooks\.slack\.com}).to_return(status: 200)  # repeated in 40 specs
  ...
end
```

**After (stub the gateway seam once):**

```ruby
class FakeSlackGateway
  attr_reader :messages
  def initialize = @messages = []
  def post(text) = @messages << text
end

it "notifies slack" do
  gateway = FakeSlackGateway.new
  Fulfillment.confirm_order(order, slack: gateway)
  expect(gateway.messages).to include(/Order/)
end
```

**Finding rule:** flag WebMock or VCR fixtures duplicated across many specs (the
seam is missing). Cite Service Stub and Gateway.

## Record Set

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/recordSet.html)):
  "An in-memory representation of tabular data."
- **Rails relevance:** `ActiveRecord::Result` and relations are the record set.
  Smell: materializing whole tables into arrays to filter or sort in Ruby what
  the database does better.

**Before (smell: an in-memory table scan):**

```ruby
Order.all.to_a.select { |order| order.status == "paid" }.sort_by(&:created_at).first(10)
```

**After:**

```ruby
Order.paid.order(:created_at).limit(10)
```

**Finding rule:** flag `.all.to_a`, `select` or `sort_by` blocks on unbounded
relations, and iteration over large tables without `find_each`. Cite Record Set
and the Rails querying guide.

## Mapper

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/mapper.html)):
  "An object that sets up a communication between two independent objects."
- **Rails relevance:** translation between an external representation and domain
  objects. Smell: external payload vocabulary (webhook JSON keys, CSV headers)
  leaking through the whole codebase because no mapper translates at the edge.

**Before (smell: the external schema leaks everywhere):**

```ruby
# the payment provider's field names threaded through domain code
charge = event["data"]["object"]
Payment.create!(stripe_amt: charge["amount"], stripe_cur: charge["currency"])
notify(charge["billing_details"]["email"])
```

**After (a mapper translates at the boundary; the domain speaks its own
language):**

```ruby
module StripeChargeMapper
  module_function

  def to_payment_attributes(event)
    charge = event.dig("data", "object")
    { amount_cents: charge["amount"], currency: charge["currency"],
      payer_email: charge.dig("billing_details", "email") }
  end
end

Payment.create!(StripeChargeMapper.to_payment_attributes(event))
```

**Finding rule:** flag external key strings (`["data"]["object"]`-style digs)
appearing outside boundary code. Cite Mapper and Gateway.

## Layer Supertype

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/layerSupertype.html)): "A type
  that acts as the supertype for all types in its layer."
- **Rails relevance:** `ApplicationRecord`, `ApplicationController`,
  `ApplicationJob`, `ApplicationMailer`. Smells: bypassing them
  (`< ActiveRecord::Base` directly), or the inverse, the supertype as a dumping
  ground of methods only a few subclasses use.

**Before (smell: a bypassed supertype, and a bloated one):**

```ruby
class LegacyImport < ActiveRecord::Base; end   # misses ApplicationRecord behavior

class ApplicationController < ActionController::Base
  def calculate_shipping_estimate(order) ... end   # used by exactly one controller
end
```

**After:** inherit from the layer supertype, and keep only layer-wide behavior
in it: pull single-consumer methods down to the consumer.

**Finding rule:** grep `< ActiveRecord::Base` and `< ActionController::Base`
outside the `Application*` definitions; flag `Application*` methods with one
caller. Cite Layer Supertype and ISP.

## Separated Interface

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/separatedInterface.html)):
  "Defines an interface in a separate package from its implementation."
- **Rails relevance:** Ruby's duck typing supplies this cheaply. The smell is
  domain code naming concrete infrastructure classes so implementations cannot
  vary (also DIP).

**Before (smell: domain code hard-wired to one implementation):**

```ruby
module Fulfillment
  module_function

  def confirm_order(order)
    TwilioClient.new(ENV["TWILIO_SID"]).sms(order.user.phone, "Confirmed!")
  end
end
```

**After (depend on a role; inject the implementation):**

```ruby
module Fulfillment
  module_function

  def confirm_order(order, notifier: SmsNotifier.new)
    notifier.deliver(order.user.phone, "Confirmed!")
  end
end
```

**Finding rule:** flag concrete third-party classes referenced inside domain
operations. Cite Separated Interface and the Dependency Inversion Principle.

## Registry

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/registry.html)):
  "A well-known object that other objects can use to find common objects and
  services."
- **Rails relevance:** `Rails.application.config`, `Rails.cache`. Fowler advises
  using a registry only as a last resort. Smells: global mutable registries
  (`$redis`, class-variable caches, `Thread.current` stashes) as hidden data
  channels between layers.

**Before (smell: `Thread.current` as a covert parameter):**

```ruby
Thread.current[:current_tenant] = tenant          # set in middleware
class Order < ApplicationRecord
  default_scope { where(tenant_id: Thread.current[:current_tenant]&.id) }  # read at a distance
end
```

**After (explicit passing, or Rails' sanctioned registry with reset
semantics):**

```ruby
class Current < ActiveSupport::CurrentAttributes   # reset per request by the framework
  attribute :tenant
end

Order.where(tenant: Current.tenant)   # explicit at query sites, no default_scope
```

**Finding rule:** grep `$` globals, `@@` class variables, and `Thread.current`
writes. Cite Registry, including its last-resort guidance.

## Value Object

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/valueObject.html)): "A small
  simple object, like money or a date range, whose equality isn't based on
  identity."
- **Rails relevance:** Primitive Obsession is the smell: domain concepts (money,
  ranges, coordinates, phone numbers) as loose primitives, with validation,
  formatting, and comparison logic re-implemented at every use site.

**Before (smell: a domain concept smeared across primitives):**

```ruby
def overlaps?(start_a, end_a, start_b, end_b)
  start_a <= end_b && start_b <= end_a
end
# every caller must keep four args straight, in order
```

**After:**

```ruby
DateRange = Data.define(:starts_on, :ends_on) do   # Ruby 3.2+
  def overlaps?(other) = starts_on <= other.ends_on && other.starts_on <= ends_on
end
```

**Finding rule:** flag repeated primitive-tuple parameters and duplicated format
or compare logic. Cite Value Object and Replace Primitive with Object
(refactoring.com).

## Money

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/money.html)):
  "Represents a monetary value."
- **Rails relevance:** the canonical Value Object. Smells: floats for currency
  (rounding drift), amounts without a currency, and arithmetic on raw decimals
  across the codebase.

**Before (smell: float money, no currency):**

```ruby
add_column :orders, :total, :float
order.total = 19.99 * 3 * 1.0825   # 65.11720249999999
```

**After (integer cents and a currency behind a Money value object, for example
from the money-rails gem):**

```ruby
add_column :orders, :total_cents, :integer, null: false, default: 0
add_column :orders, :total_currency, :string, null: false, default: "USD"

class Order < ApplicationRecord
  monetize :total_cents   # order.total => Money; arithmetic, rounding, formatting handled once
end
```

**Finding rule:** grep the schema for `float` or `decimal` money-named columns
without currency companions; flag `to_f` on money. Severity HIGH (CRITICAL if
float). Cite Money.

## Special Case

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/specialCase.html)): "A subclass
  that provides special behavior for particular cases."
- **Rails relevance:** the Null Object pattern. Smell: `nil` checks for the same
  absent thing repeated across the codebase (`user&.name || "Guest"` in 30
  places).

**Before (smell: nil handling duplicated at every call site):**

```ruby
post.author ? post.author.name : "Anonymous"
post.author&.avatar_url || "default-avatar.png"
if post.author && post.author.premium? ...
```

**After:**

```ruby
class GuestAuthor
  def name = "Anonymous"
  def avatar_url = "default-avatar.png"
  def premium? = false
end

class Post < ApplicationRecord
  belongs_to :author, optional: true

  def author
    super || GuestAuthor.new
  end
end
```

A class fits here: callers send the guest the same messages as a real author,
which a method or module function cannot do.

**Finding rule:** flag repeated `&.` or `|| default` chains against the same
association or attribute. Cite Special Case.

## Plugin

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/plugin.html)):
  "Links classes during configuration rather than compilation."
- **Rails relevance:** implementation selection driven by environment or
  configuration. Smell: `Rails.env` branches buried in domain code, so behavior
  differs across environments in ways configuration never declares, and staging
  paths never run in test.

**Before (smell: environment switches inside domain logic):**

```ruby
def deliver_sms(phone, body)
  if Rails.env.production?
    TwilioClient.send(phone, body)
  elsif Rails.env.staging?
    FakeSms.log(phone, body)
  end   # test/dev: silently does nothing
end
```

**After (configuration selects the implementation once):**

```ruby
# config/environments/production.rb: config.x.sms_client = TwilioClient.new
# config/environments/test.rb:       config.x.sms_client = FakeSmsClient.new

def deliver_sms(phone, body)
  Rails.configuration.x.sms_client.send(phone, body)
end
```

**Finding rule:** grep `Rails.env.` outside `config/` and initializers. Cite
Plugin and OCP.
