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

**Fix:** A coarse-grained facade returning what the screen needs.

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

**Fix:** Explicit, minimal transfer objects.

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

**Fix:** Version detection; the conflict surfaced to the user.

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

**Fix:** Do the check and the write inside `with_lock`, raising when the check
fails (`with_lock { raise InsufficientStock if stock < quantity; update!(...) }`).

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

**Fix:** One lock on the root covers the set.

**Finding rule:** flag loops acquiring row locks per iteration. Cite
Coarse-Grained Lock.

### Implicit Lock

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/implicitLock.html)): "Allows
  framework or layer supertype code to acquire offline locks."
- **Rails relevance:** locking left to developer memory at every call site
  _will_ be forgotten, which is Fowler's core argument. Centralize it in the
  owning operation or the supertype.

**Fix:** The operation acquires the lock, so call sites cannot forget.

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

**Fix:** Persist bulky or authoritative state server-side; keep only references in the session.

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

**Fix:** Explicit server-side state with a lifecycle.

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

**Fix:** An explicit lifecycle and cleanup, the requirements Fowler states for this pattern.

**Finding rule:** flag wizard and checkout flows that create canonical rows
early without a status to tell drafts apart and a job to reap them. Cite
Database Session State.
