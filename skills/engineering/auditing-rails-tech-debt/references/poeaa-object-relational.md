# PoEAA: Object-Relational Patterns

Source: the three object-relational categories (behavioral, structural, and
metadata mapping) in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Behavioral patterns: Unit of Work, Identity Map, Lazy Load
- Structural patterns: Identity Field, Inheritance Mappers, Foreign Key Mapping,
  Association Table Mapping, Dependent Mapping, Embedded Value, Serialized LOB,
  Single Table Inheritance, Class Table Inheritance, Concrete Table Inheritance
- Metadata mapping patterns: Metadata Mapping, Query Object, Repository

## Behavioral patterns

### Unit of Work

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/unitOfWork.html)): "Maintains a
  list of objects affected by a business transaction and coordinates the writing
  out of changes and the resolution of concurrency problems."
- **Rails relevance:** Rails has no full Unit of Work;
  `ActiveRecord::Base.transaction` is the coordination tool. Smell: multi-record
  business operations performed as independent saves, so a mid-sequence failure
  leaves the database half-written.

**Fix:** One business transaction, one database transaction.

**Finding rule:** flag sequences of dependent `save!`, `update!`, or `create!`
across records with no wrapping transaction. Severity CRITICAL on money and
inventory paths. Cite Unit of Work and the Rails transactions API. Also flag the
inverse: non-database side effects (emails, HTTP calls) _inside_ transactions,
since they cannot roll back.

### Identity Map

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/identityMap.html)): "Ensures
  that each object gets loaded only once by keeping every loaded object in a
  map. Looks up objects using the map when referring to them."
- **Rails relevance:** Rails has no identity map (removed in 4.0). The
  consequence to hunt: two in-memory copies of the same row where a write to one
  is invisible to the other, causing stale-state bugs.

**Fix:** Thread one instance through, or `reload` at trust boundaries.

**Finding rule:** flag methods loading the same record through two paths,
especially load, mutate, then decide flows. Cite Identity Map (the pattern Rails
lacks, so code must compensate).

### Lazy Load

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/lazyLoad.html)):
  "An object that doesn't contain all of the data you need but knows how to get
  it."
- **Rails relevance:** associations are lazy by default, the source of the **N+1
  query** problem, the most common Rails performance debt.

**Fix:** Eager load what the view touches; a counter cache for counts.

**Finding rule:** flag association access inside iteration over a relation
loaded without `includes`, `preload`, or `eager_load`. Recommend
`strict_loading` (Rails 6.1+) as a guard rail. Cite Lazy Load and the
[eager loading guide](https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations).

## Structural patterns

### Identity Field

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/identityField.html)): "Saves a
  database ID field in an object to maintain identity between an in-memory
  object and a database row."
- **Rails relevance:** `id` primary keys, which Rails handles. Smell:
  business-meaningful natural keys used as identity (emails, SKUs), so identity
  breaks when the business value changes, or raw sequential IDs exposed where
  enumeration is a risk.

**Fix:** Surrogate identity; natural attributes stay mutable data.

**Finding rule:** flag joins and lookups on mutable business attributes used as
identity. Cite Identity Field.

### Inheritance Mappers

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/inheritanceMappers.html)): "A
  structure to organize database mappers that handle inheritance hierarchies."
- **Rails relevance:** Rails implements this internally for STI and delegated
  types. Cite it when code hand-rolls per-subclass persistence dispatch
  (`case type when ... then insert into table_a`) instead of using STI or
  delegated types; the hand-rolled version is an unnamed, untested Inheritance
  Mapper.

### Foreign Key Mapping

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/foreignKeyMapping.html)): "Maps
  an association between objects to a foreign key reference between tables."
- **Rails relevance:** `belongs_to` and `has_many`. Smells: foreign key columns
  without database constraints (orphan rows), and associations navigated by
  hand.

**Fix:** `t.references :post, null: false, foreign_key: true, index: true` in
the migration, and `belongs_to :post` on the model.

**Finding rule:** compare `_id` columns in the schema against `add_foreign_key`
lines; flag `_id` columns lacking constraints or indexes, and models
re-implementing association lookup. Cite Foreign Key Mapping.

### Association Table Mapping

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/associationTableMapping.html)):
  "Saves an association as a table with foreign keys to the tables that are
  linked by the association."
- **Rails relevance:** `has_many :through` and `has_and_belongs_to_many`.
  Smells: serialized ID arrays instead of a join table, and HABTM when the join
  has (or grows) attributes.

**Fix:** A join model (`Membership` with `belongs_to :user` and
`belongs_to :team`) and `has_many :teams, through: :memberships`.

**Finding rule:** flag serialized or comma-separated ID columns, and HABTM joins
that need attributes (role, joined_at). Cite Association Table Mapping.

### Dependent Mapping

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/dependentMapping.html)): "Has
  one class perform the database mapping for a child class."
- **Rails relevance:** children that exist only through their parent. Smell:
  dependent children exposed as independent top-level records, with their own
  controllers and routes and no `dependent:` cleanup, so orphans accumulate.

**Fix:** The owner manages its dependents, which is also DDD's Aggregate rule.

**Finding rule:** flag `has_many` without `dependent:` where children are
meaningless alone, and top-level routes for dependent records. Cite Dependent
Mapping and DDD Aggregates (domainlanguage.com).

### Embedded Value

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/embeddedValue.html)): "Maps an
  object into several fields of another object's table."
- **Rails relevance:** `composed_of`, or plain value wrappers over column
  groups. Smell: column clumps (`street`, `city`, `zip`; `amount_cents`,
  `currency`) manipulated as loose primitives with duplicated logic.

**Fix:** A value object over the column group, such as
`Address = Data.define(:street, :city, :zip)` returned by
`User#billing_address`, with the shared logic on it.

**Finding rule:** flag column groups always used together (Fowler's Data Clumps
smell). Cite Embedded Value, Value Object, and Replace Primitive with Object
(refactoring.com).

### Serialized LOB

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/serializedLOB.html)): "Saves a
  graph of objects by serializing them into a single large object (LOB), which
  it stores in a database field."
- **Rails relevance:** `serialize`, `store`, and jsonb columns. Legitimate for
  opaque blobs; a smell when the app _queries or joins on_ the serialized data,
  or when relational children hide inside it.

**Fix:** Promote queried structure to tables; keep LOBs for opaque data.

**Finding rule:** flag `LIKE` or string matching against serialized columns, and
serialized arrays of hashes with stable schemas. Cite Serialized LOB; Fowler
notes a LOB cannot be queried, so promote it once querying starts.

### Single Table Inheritance

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/singleTableInheritance.html)):
  "Represents an inheritance hierarchy of classes as a single table that has
  columns for all the fields of the various classes."
- **Rails relevance:** the `type` column. Two smells: (1) hand-rolled type
  switches instead of STI; (2) STI abuse, with subclasses so divergent the table
  is mostly NULL columns.

**Fix:** STI, which is Replace Conditional with Polymorphism.

**Smell 2 (STI abuse) before:** one `vehicles` table with 40 columns where
`Boat` uses 8 and `Truck` uses 9. **After:** separate tables (Concrete Table
Inheritance) or `delegated_type` (Rails 6.1+), which is shaped like Class Table
Inheritance.

**Finding rule:** flag repeated `case` or `if` on a type or kind column (cite
STI, Replace Conditional with Polymorphism, and OCP). Flag STI tables with many
mostly-NULL columns (cite STI's documented drawbacks: wasted space and
single-table coupling).

### Class Table Inheritance

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/classTableInheritance.html)):
  "Represents an inheritance hierarchy of classes with one table for each
  class."
- **Rails relevance:** no native support; the Rails idiom is `delegated_type` or
  composition. Cite it when hand-rolled parent and child table splits leak join
  logic everywhere.

**Fix:** `delegated_type` or composition.

### Concrete Table Inheritance

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/concreteTableInheritance.html)):
  "Represents an inheritance hierarchy of classes with one table per concrete
  class in the hierarchy."
- **Rails relevance:** separate models and tables sharing behavior through an
  abstract class or concern. Smell: copy-pasted columns _and_ copy-pasted logic
  across sibling tables with no shared supertype.

**Fix:** An abstract supertype (`self.abstract_class = true`) holding the shared
methods, which each concrete model subclasses.

**Finding rule:** flag duplicated methods across models with parallel schemas.
Cite Concrete Table Inheritance and DRY.

## Metadata mapping patterns

### Metadata Mapping

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/metadataMapping.html)): "Holds
  details of object-relational mapping in metadata."
- **Rails relevance:** Rails _is_ metadata mapping (schema reflection,
  convention over configuration). Smell: fighting the metadata with
  hand-maintained column lists, `attr_accessor` shadowing real columns (silently
  detaching an attribute from persistence), or stale `self.table_name` hacks.

**Fix:** delete the shadowing accessor and let the metadata mapping provide it.

**Finding rule:** grep `attr_accessor` and `attr_writer` in models against the
schema's columns. Severity HIGH: this is a silent data-loss bug. Cite Metadata
Mapping.

### Query Object

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/queryObject.html)): "An object
  that represents a database query."
- **Rails relevance:** a scope is a named, composable query object, and the
  simplest one. Reach for a dedicated query class only when the query holds
  state, such as a search form's filter parameters. Smells: long `where` chains
  duplicated across call sites, and SQL string fragments concatenated
  conditionally.

**Fix:** One named scope both call sites compose.

**Finding rule:** flag query chains of three or more conditions appearing (or
nearly appearing) in several places. Cite Query Object and DRY.

### Repository

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/repository.html)): "Mediates
  between the domain and data mapping layers using a collection-like interface
  for accessing domain objects."
- **Rails relevance:** ActiveRecord's relation interface already approximates
  it; full Repositories are usually over-engineering in Rails, so do not flag
  their absence. Cite Repository for the _leak_ smell: query construction spread
  through views and controllers, so the data layer has no boundary at all.

**Fix:** Collection-like access behind the model's query layer.

**Finding rule:** flag ActiveRecord queries in views, helpers, and serializers.
Cite Repository and MVC separation.
