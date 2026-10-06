# Rails-specific anti-patterns

Rails smells not directly named by a PoEAA pattern. Each entry cites its
authoritative source; [citation resources](references/resources.md) has the full
list.

## Contents

- Fat controller
- Fat model or god model
- Callback abuse
- default_scope
- N+1 queries
- SQL injection through string interpolation
- Law of Demeter train wrecks
- Business logic in views, helpers as a junk drawer
- Scopes and queries leaking into jobs and rake tasks
- Concerns as junk drawers
- Migration and schema debt
- Time and zone bugs
- Unbounded job payloads and non-idempotent jobs
- Boolean flag columns growing into a state machine
- update_attribute, update_column, save(validate: false)
- rescue nil and blanket rescue

## Fat controller

- **Violates:**
  [MVC](https://martinfowler.com/eaaCatalog/modelViewController.html);
  skinny-controller conventions (Rails AntiPatterns, Pytel and Saleh; the
  [Rails Style Guide](https://rails.rubystyle.guide/)).
- **Smell signals:** actions over 10 lines, business branching, direct model
  attribute manipulation, several model writes per action.

**Before:**

```ruby
def create
  @user = User.new(user_params)
  @user.trial_ends_at = 14.days.from_now
  @user.referral_code = SecureRandom.hex(4)
  if params[:referrer_code].present?
    referrer = User.find_by(referral_code: params[:referrer_code])
    referrer&.increment!(:referral_count)
    @user.referred_by = referrer
  end
  if @user.save
    WelcomeMailer.welcome(@user).deliver_later
    redirect_to dashboard_path
  else
    render :new, status: :unprocessable_entity
  end
end
```

**After (the controller does HTTP; the model owns its defaults and the sign-up
operation):**

```ruby
def create
  @user = User.sign_up!(user_params, referrer_code: params[:referrer_code])
  redirect_to dashboard_path
rescue ActiveRecord::RecordInvalid => error
  @user = error.record
  render :new, status: :unprocessable_entity
end

class User < ApplicationRecord
  attribute :trial_ends_at, default: -> { 14.days.from_now }
  attribute :referral_code, default: -> { SecureRandom.hex(4) }

  def self.sign_up!(attributes, referrer_code: nil)
    referrer = find_by(referral_code: referrer_code) if referrer_code.present?
    user = transaction do
      referrer&.increment!(:referral_count)
      create!(attributes.merge(referred_by: referrer))
    end
    WelcomeMailer.welcome(user).deliver_later
    user
  end
end
```

## Fat model or god model

- **Violates:** SRP; Active Record's
  [stated limits](https://martinfowler.com/eaaCatalog/activeRecord.html); Sandi
  Metz's
  [100-line rule](https://thoughtbot.com/blog/sandi-metz-rules-for-developers).
- **Refactorings:** the
  [seven decomposition patterns](https://codeclimate.com/blog/7-ways-to-decompose-fat-activerecord-models):
  Value Objects, Service Objects, Form Objects, Query Objects, View or Presenter
  Objects, Policy Objects, Decorators. Choose the simplest that removes the
  smell: a Service or Form Object only when it holds state or orchestrates
  several models. See Active Record in
  [data source patterns](references/poeaa-data-source.md) for before and after.

## Callback abuse

- **Violates:** thoughtbot's
  [callback guidance](https://thoughtbot.com/blog/activerecord-callbacks-cause-more-problems-than-theyre-worth);
  Fail Fast;
  [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html).
- **Rule of thumb:** callbacks may maintain _the record's own_ state (normalize
  a slug, stamp a token). Callbacks that touch other records, enqueue jobs, or
  call external services couple every save path (imports, backfills, tests) to
  side effects.

**Before:**

```ruby
class Comment < ApplicationRecord
  after_create :notify_everyone

  private

  def notify_everyone
    post.touch(:last_activity_at)                    # writes another record
    post.subscribers.each { |s| NotifyJob.perform_later(s.id, id) }  # fan-out on save
  end
end
# Comment.create! in a data migration just emailed 40,000 people
```

**After (an explicit operation on the owning model, called only where a person
comments):**

```ruby
class Post < ApplicationRecord
  def add_comment!(author:, body:)
    comment = comments.create!(author:, body:)
    touch(:last_activity_at)
    subscribers.find_each { |subscriber| NotifyJob.perform_later(subscriber.id, comment.id) }
    comment
  end
end
```

## default_scope

- **Violates:** the
  [Rails Style Guide](https://rails.rubystyle.guide/#avoid-default-scope); the
  Principle of Least Astonishment.
- **Why:** it invisibly rewrites every query, infects associations and
  `Model.new` defaults, and must be escaped with `unscoped`, which dangerously
  drops _all_ scoping.

**Before:**

```ruby
class Post < ApplicationRecord
  default_scope { where(deleted_at: nil).order(created_at: :desc) }
end
Post.find(hidden_id)         # RecordNotFound, mystifying
Post.unscoped.where(...)     # now also lost the tenant scope someone added later
```

**After:**

```ruby
class Post < ApplicationRecord
  scope :kept, -> { where(deleted_at: nil) }
  scope :newest_first, -> { order(created_at: :desc) }
end
Post.kept.newest_first
```

## N+1 queries

See Lazy Load in
[object-relational patterns](references/poeaa-object-relational.md). Cite the
[eager loading guide](https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations).
Recommend `strict_loading` or the bullet gem as guard rails.

## SQL injection through string interpolation

- **Violates:** the
  [Rails Security Guide](https://guides.rubyonrails.org/security.html#sql-injection).
  Severity CRITICAL.

**Before:**

```ruby
User.where("name LIKE '%#{params[:q]}%'")
Order.order(params[:sort])   # order, pluck, and group are also injectable
```

**After:**

```ruby
User.where("name LIKE ?", "%#{User.sanitize_sql_like(params[:q])}%")
Order.order(Order.column_names.include?(params[:sort]) ? params[:sort] : :created_at)
```

**Finding rule:** grep for `#{` inside `where(`, `order(`, `group(`, `having(`,
`joins(`, `select(`, and `find_by_sql`.

## Law of Demeter train wrecks

- **Violates:** the
  [Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter); Rails
  AntiPatterns chapter 1.

**Before:**

```ruby
order.customer.billing_address.city
# the view raises NoMethodError on nil when any hop is missing;
# reshaping the association graph breaks every call site
```

**After:**

```ruby
class Order < ApplicationRecord
  delegate :billing_city, to: :customer, allow_nil: true
end
class Customer < ApplicationRecord
  delegate :city, to: :billing_address, prefix: :billing, allow_nil: true
end
order.billing_city
```

## Business logic in views, helpers as a junk drawer

See Template View in
[web presentation patterns](references/poeaa-web-presentation.md). The
helper-specific smell: a global namespace of stateless functions accreting
domain logic. **After:** domain rules move to model methods; view formatting
stays in helpers, or moves to a presenter or ViewComponent when many methods
wrap one object. Cite Template View and Sandi Metz's
one-instance-variable-per-view rule.

## Scopes and queries leaking into jobs and rake tasks

- **Violates:**
  [Query Object](https://martinfowler.com/eaaCatalog/queryObject.html); DRY.
- Rake tasks and one-off jobs that duplicate business queries drift out of sync
  with the app's definitions. **After:** call the same scopes the app uses.

## Concerns as junk drawers

- **Violates:** SRP; cohesion (Ousterhout's deep modules).
- **Smell:** `app/models/concerns/` modules named as grab-bags (`Utilities`,
  `Shared`), concerns included in one model only (indirection without reuse), or
  concerns reaching into host internals, so the "module" is really a fragment of
  a god class.

**Before:**

```ruby
module OrderStuff
  extend ActiveSupport::Concern
  # tax math + CSV export + Slack pings, included only by Order
end
```

**After:** split by responsibility into the simplest home: tax math as `Order`
methods, CSV export as a module function, Slack pings through a `SlackGateway`
(see Gateway in [base patterns](references/poeaa-base.md)). A concern is
justified when the _same behavior with the same contract_ is shared, such as
`Archivable` across several models.

## Migration and schema debt

- **Violates:** the
  [migrations guide](https://guides.rubyonrails.org/active_record_migrations.html);
  Fail Fast.
- **Smells:** missing `null: false` on required columns (validation only in
  Ruby); missing unique indexes under uniqueness validations (a race produces
  duplicates, as the guide documents); data manipulation inside schema
  migrations that reference model classes.

**Before:**

```ruby
validates :email, uniqueness: true      # no unique index: two concurrent signups both pass
```

**After:**

```ruby
add_index :users, :email, unique: true  # constraint where it is enforceable
validates :email, uniqueness: true      # kept for friendly errors
```

## Time and zone bugs

- **Violates:** Rails time zone conventions (the
  [Rails Style Guide](https://rails.rubystyle.guide/#time) and the rubocop-rails
  `Rails/TimeZone` cop).
- **Before:** `Time.now`, `Date.today`, `DateTime.now`, which depend on the
  server's zone. **After:** `Time.current`, `Date.current`, `Time.zone.parse`.

## Unbounded job payloads and non-idempotent jobs

- **Violates:** Enterprise Integration Patterns'
  [Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html);
  Data Transfer Object (job arguments).
- **Smells:** jobs that fail halfway and re-run side effects on retry (double
  emails, double charges); giant serialized arguments.

**Before:**

```ruby
class ChargeJob < ApplicationJob
  def perform(order_id)
    order = Order.find(order_id)
    PaymentGateway.charge(order.user.card_token, order.total)   # retry: double charge
    order.update!(status: "paid")
  end
end
```

**After:**

```ruby
class ChargeJob < ApplicationJob
  def perform(order_id)
    order = Order.find(order_id)
    return if order.paid?                                   # idempotency guard
    PaymentGateway.charge(order.user.card_token, order.total,
                          idempotency_key: "order-charge-#{order.id}")
    order.update!(status: "paid")
  end
end
```

## Boolean flag columns growing into a state machine

- **Violates:** Domain Model; Replace Type Code with State/Strategy
  (refactoring.com).
- **Before:** `approved`, `rejected`, `archived`, `published` boolean columns
  with impossible combinations (`approved && rejected`). **After:** one `status`
  enum (or a state-machine gem) with declared transitions:

```ruby
class Article < ApplicationRecord
  enum :status, { draft: 0, in_review: 1, published: 2, archived: 3 }
end
```

## update_attribute, update_column, save(validate: false)

- **Violates:** Fail Fast; the
  [validations guide](https://guides.rubyonrails.org/active_record_validations.html).
  These bypass validations (and `update_column` bypasses callbacks too), letting
  invalid data persist silently.
- **Finding rule:** grep for them; each use needs a documented, load-bearing
  justification or it is a finding.

## rescue nil and blanket rescue

- **Violates:** Fail Fast, Fail Loud; the
  [Ruby Style Guide](https://rubystyle.guide/#no-blind-rescues).

**Before:**

```ruby
total = calculate_total(order) rescue 0
begin
  sync_to_crm(user)
rescue => e
  # swallowed
end
```

**After:**

```ruby
begin
  sync_to_crm(user)
rescue CrmGateway::Error => error
  Rails.error.report(error, context: { user_id: user.id })
  raise if critical_path?
end
```
