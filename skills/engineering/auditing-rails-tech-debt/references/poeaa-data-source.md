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

**Fix:** All access to the table through one gateway, the model's query interface.

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

**Fix:** Use the model; if the motivation was fewer columns, use `select`, `pluck`, or `pick`.

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

**Fix:** Extract Class for concepts with their own table; a module function for stateless logic that does not map to the users table.

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

**Fix:** Compute on demand; persist only what the business must keep.

**Finding rule:** flag ActiveRecord subclasses whose tables hold no durable
business state (write-once scratch tables, or calculation caches better served
by `Rails.cache`). Cite Data Mapper (separation of domain from persistence) and
Domain Model.
