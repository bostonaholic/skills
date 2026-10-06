# PoEAA: Distribution, Offline Concurrency, and Session State Patterns

Source: the Distribution, Offline Concurrency, and Session State Patterns in
Fowler's [PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Distribution patterns: Remote Facade, Data Transfer Object
- Offline concurrency patterns: Optimistic Offline Lock, Pessimistic Offline
  Lock, Coarse-Grained Lock, Implicit Lock
- Session state patterns: Client Session State, Server Session State, Database
  Session State

## Distribution patterns

### Remote Facade

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/remoteFacade.html)): "Provides a
  coarse-grained facade on fine-grained objects to improve efficiency over a
  network."
- **Rails relevance:** API endpoint design. Smell: chatty APIs, where clients
  call N fine-grained endpoints to render one screen, or internal service calls
  made per item in a loop.

**Before (smell: a chatty client protocol forced by fine-grained endpoints):**

```ruby
# client needs 1 + N + N requests to render an order page:
# GET /orders/1, then GET /line_items/:id per item, then GET /products/:id per item
resources :orders, only: :show
resources :line_items, only: :show
```

**After (a coarse-grained facade returning what the screen needs):**

```ruby
# GET /orders/1 returns the order, its items, and product summaries in one response
class OrdersController < ApplicationController
  def show
    @order = Order.includes(line_items: :product).find(params[:id])
    # show.json.jbuilder renders the order, items, and product summaries
  end
end
```

**Finding rule:** flag endpoints whose consumers loop over IDs to fetch
children, and internal per-item HTTP calls inside iterations. Cite Remote
Facade.

### Data Transfer Object

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/dataTransferObject.html)): "An
  object that carries data between processes in order to reduce the number of
  method calls."
- **Rails relevance:** response payloads and job arguments. Smells: whole
  ActiveRecord objects passed into background jobs (deserialization races, stale
  state), and bare hashes crossing boundaries with no schema.

**Before (smell: an ActiveRecord object serialized into a job; an anonymous hash
contract):**

```ruby
ReportJob.perform_later(current_user, filters_hash)   # GlobalID-loads a possibly deleted user
SearchService.call({ q: params[:q], pg: params[:page], "sort" => "desc" })  # stringly typed contract
```

**After (explicit, minimal transfer objects):**

```ruby
ReportJob.perform_later(user_id: current_user.id, filters: params.permit(:status, :from, :to).to_h)

SearchQuery = Data.define(:term, :page, :sort_direction)   # Ruby 3.2+
SearchService.call(SearchQuery.new(term: params[:q], page: 1, sort_direction: :desc))
```

**Finding rule:** flag jobs taking ActiveRecord instances where staleness
matters, and multi-key hashes passed through two or more layers. Cite Data
Transfer Object.

## Offline concurrency patterns

### Optimistic Offline Lock

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html)):
  "Prevents conflicts between concurrent business transactions by detecting a
  conflict and rolling back the transaction."
- **Rails relevance:** the `lock_version` column
  (`ActiveRecord::Locking::Optimistic`). Smell: edit screens for contended
  records with no locking, so the last write silently wins and users overwrite
  each other.

**Before (smell: concurrent edits, a silent lost update):**

```ruby
class ArticlesController < ApplicationController
  def update
    @article = Article.find(params[:id])
    @article.update!(article_params)   # editor B silently erases editor A's changes
  end
end
```

**After (version detection; the conflict surfaced to the user):**

```ruby
# migration: add_column :articles, :lock_version, :integer, default: 0, null: false
def update
  @article = Article.find(params[:id])
  @article.update!(article_params.merge(lock_version: params[:article][:lock_version]))
rescue ActiveRecord::StaleObjectError
  render :edit, alert: "This article was changed while you were editing."
end
```

**Finding rule:** flag human-edited, multi-writer models lacking `lock_version`.
Cite Optimistic Offline Lock.

### Pessimistic Offline Lock

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html)):
  "Prevents conflicts between concurrent business transactions by allowing only
  one business transaction at a time to access data."
- **Rails relevance:** `with_lock` and `lock` (SELECT FOR UPDATE) for sections
  that must not conflict. Smell: read, compute, write on balances or inventory
  with no lock, the classic race.

**Before (smell: a check-then-act race):**

```ruby
def reserve(quantity)
  if stock >= quantity                 # two requests both pass the check
    update!(stock: stock - quantity)   # oversold
  end
end
```

**After:**

```ruby
def reserve(quantity)
  with_lock do
    raise InsufficientStock if stock < quantity
    update!(stock: stock - quantity)
  end
end
```

**Finding rule:** flag conditional writes based on freshly read values on
contended rows (money, stock, seats). Severity CRITICAL. Cite Pessimistic
Offline Lock.

### Coarse-Grained Lock

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/coarseGrainedLock.html)): "Locks
  a set of related objects with a single lock."
- **Rails relevance:** lock the aggregate root, not each child. Smell: iterating
  children and locking row by row, which is deadlock-prone and still racy at the
  aggregate level.

**Before (smell: per-child locking, deadlock bait):**

```ruby
order.line_items.each { |item| item.with_lock { item.allocate! } }
```

**After (one lock on the root covers the set):**

```ruby
order.with_lock do
  order.line_items.each(&:allocate!)
end
```

**Finding rule:** flag loops acquiring row locks per iteration. Cite
Coarse-Grained Lock.

### Implicit Lock

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/implicitLock.html)): "Allows
  framework or layer supertype code to acquire offline locks."
- **Rails relevance:** locking left to developer memory at every call site
  _will_ be forgotten, which is Fowler's core argument. Centralize it in the
  owning operation or the supertype.

**Before (smell: every caller must remember the lock):**

```ruby
# five different call sites each hand-roll (or forget) with_lock around wallet math
wallet.with_lock { wallet.update!(balance: wallet.balance - amount) }   # site A
wallet.update!(balance: wallet.balance - amount)                        # site B forgot
```

**After (the operation acquires the lock, so call sites cannot forget):**

```ruby
class Wallet < ApplicationRecord
  def debit!(amount)
    with_lock do
      raise InsufficientFunds if balance < amount
      update!(balance: balance - amount)
    end
  end
end
```

**Finding rule:** flag invariant-guarding locks required at call sites rather
than inside the owning operation. Cite Implicit Lock.

## Session state patterns

### Client Session State

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/clientSessionState.html)):
  "Stores session state on the client."
- **Rails relevance:** the default cookie store. Constraints: about a 4KB limit,
  sent with every request, and it must never hold secrets or
  authorization-bearing data.

**Before (smell: bulky or sensitive state in the cookie session):**

```ruby
session[:cart] = @cart.line_items.map(&:attributes)   # blows the 4KB cookie limit
session[:role] = "admin"                               # client-visible authorization state
```

**After (persist bulky or authoritative state server-side; keep only references
in the session):**

```ruby
session[:cart_id] = @cart.id
# authorization derived server-side from current_user.role, never from the cookie
```

**Finding rule:** flag object graphs and authorization data written into
`session`. Cite Client Session State and the Rails Security Guide's session
guidelines.

### Server Session State

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/serverSessionState.html)):
  "Keeps the session state on a server system in a serialized form."
- **Rails relevance:** cache and Redis session stores. Smells: in-memory or
  single-node session state in a multi-server deployment (users randomly logged
  out), or the session as a dumping ground for cross-request workflow state.

**Before (smell: workflow state accreting in the session):**

```ruby
session[:wizard] ||= {}
session[:wizard][:step3] = params.to_unsafe_h   # unbounded, unversioned, never expires
```

**After (explicit server-side state with a lifecycle):**

```ruby
draft = OnboardingDraft.find_or_create_by!(user: current_user)
draft.update!(step3_attributes)   # queryable, expirable, schema-checked
```

**Finding rule:** flag multi-key mutable structures living in `session` across
many requests. Cite Server Session State.

### Database Session State

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/databaseSessionState.html)):
  "Stores session data as committed data in the database."
- **Rails relevance:** activerecord-session_store, or, the pattern's real Rails
  shape, in-progress work modeled as real rows (draft orders, pending signups).
  Smell: half-finished rows polluting canonical tables with no status to tell
  them apart and no cleanup.

**Before (smell: drafts indistinguishable from real records):**

```ruby
Order.create!(user: current_user)         # created at wizard step 1
Order.count                                # every report now counts abandoned drafts
```

**After (an explicit lifecycle and cleanup, the requirements Fowler states for
this pattern):**

```ruby
Order.create!(user: current_user, status: :draft)
scope :submitted, -> { where.not(status: :draft) }
# recurring job: Order.draft.where(updated_at: ..30.days.ago).destroy_all
```

**Finding rule:** flag wizard and checkout flows that create canonical rows
early without a status to tell drafts apart and a job to reap them. Cite
Database Session State.
