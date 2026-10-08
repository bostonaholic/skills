# PoEAA: Domain Logic Patterns

Source: the Domain Logic Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/). Each entry gives Fowler's
definition, the Rails mapping, the fix, and the finding rule.

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

**Fix:** A named procedure, which is what a Transaction Script is; push behavior into the Domain Model when the logic is shared.

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

**Fix:** Behavior and data together.

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

**Fix:** Instance behavior on the domain object.

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

**Fix:** For orchestration in a callback, an explicit application operation
(`Fulfillment.confirm_order(order)`) called where the business event happens;
models keep their own invariants.

**Fix:** For a service hoarding domain logic, move the calculation onto the
model it describes (an order's total becomes an `Order#total` method); keep the
service layer for cross-boundary coordination only.

**Finding rule:** flag multi-model writes plus external side effects in
controllers or callbacks (cite Service Layer and the thoughtbot callback
guidelines). Flag services computing single-model derivations (cite Service
Layer's thin-layer guidance and Anemic Domain Model).
