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

**Fix:** The controller does HTTP only. The model owns attribute defaults
(`attribute :trial_ends_at, default: -> { 14.days.from_now }`) and a
`User.sign_up!` class method that wraps the record and referral writes in one
transaction.

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
  [data source patterns](references/poeaa-data-source.md).

## Callback abuse

- **Violates:** thoughtbot's
  [callback guidance](https://thoughtbot.com/blog/activerecord-callbacks-cause-more-problems-than-theyre-worth);
  Fail Fast;
  [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html).
- **Rule of thumb:** callbacks may maintain _the record's own_ state (normalize
  a slug, stamp a token). Callbacks that touch other records, enqueue jobs, or
  call external services couple every save path (imports, backfills, tests) to
  side effects.

**Fix:** Move the side effects into an explicit operation on the owning model
(`Post#add_comment!` creates the comment, touches the post, and enqueues
notifications), called only where a person comments, so imports and backfills
skip them.

## default_scope

- **Violates:** the
  [Rails Style Guide](https://rails.rubystyle.guide/#avoid-default-scope); the
  Principle of Least Astonishment.
- **Why:** it invisibly rewrites every query, infects associations and
  `Model.new` defaults, and must be escaped with `unscoped`, which dangerously
  drops _all_ scoping.

**Fix:** Named scopes applied explicitly (`scope :kept`, `scope :newest_first`;
`Post.kept.newest_first`).

## N+1 queries

See Lazy Load in
[object-relational patterns](references/poeaa-object-relational.md). Cite the
[eager loading guide](https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations).
Recommend `strict_loading` or the bullet gem as guard rails.

## SQL injection through string interpolation

- **Violates:** the
  [Rails Security Guide](https://guides.rubyonrails.org/security.html#sql-injection).
  Severity CRITICAL. `order`, `pluck`, and `group` are injectable too, not
  only `where`.

**Fix:** Bind parameters and escape wildcards
(`where("name LIKE ?", "%#{User.sanitize_sql_like(params[:q])}%")`); check a
user-supplied sort against an allowlist such as `Order.column_names` before
passing it to `order`.

**Finding rule:** grep for `#{` inside `where(`, `order(`, `group(`, `having(`,
`joins(`, `select(`, and `find_by_sql`.

## Law of Demeter train wrecks

- **Violates:** the
  [Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter); Rails
  AntiPatterns chapter 1.
- **Smell:** `order.customer.billing_address.city` raises on any nil hop and
  breaks every call site when the association graph changes.

**Fix:** `delegate` one hop at a time with `allow_nil: true` (and `prefix:`),
so callers write `order.billing_city`.

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

**Fix:** split by responsibility into the simplest home: tax math as `Order` methods, CSV export as a module function, Slack pings through a `SlackGateway` (see Gateway in [base patterns](references/poeaa-base.md)). A concern is justified when the _same behavior with the same contract_ is shared, such as `Archivable` across several models.

## Migration and schema debt

- **Violates:** the
  [migrations guide](https://guides.rubyonrails.org/active_record_migrations.html);
  Fail Fast.
- **Smells:** missing `null: false` on required columns (validation only in
  Ruby); missing unique indexes under uniqueness validations (a race produces
  duplicates, as the guide documents); data manipulation inside schema
  migrations that reference model classes.

**Fix:** Add `add_index :users, :email, unique: true` under
`validates :email, uniqueness: true`; keep the validation for friendly errors.

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

**Fix:** Pass IDs, not objects. Guard the side effect (`return if order.paid?`)
and pass the gateway an idempotency key (`idempotency_key: "order-charge-#{order.id}"`).

## Boolean flag columns growing into a state machine

- **Violates:** Domain Model; Replace Type Code with State/Strategy
  (refactoring.com).
- **Before:** `approved`, `rejected`, `archived`, `published` boolean columns
  with impossible combinations (`approved && rejected`). **After:** one `status`
  enum (or a state-machine gem) with declared transitions, such as
  `enum :status, { draft: 0, in_review: 1, published: 2, archived: 3 }`.

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

**Fix:** Rescue the specific error class, report it
(`Rails.error.report(error, context: ...)`), and re-raise on a critical path.
