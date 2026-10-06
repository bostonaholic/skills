# Citation resources

Every finding links at least one resource from this file, or a specific pattern
page from the PoEAA reference files. Prefer the most specific citation: a
pattern page beats a book link, and a named principle beats a general guide.

## Contents

- Resources from Fowler's Enterprise Application Patterns guide
- Fowler bliki entries often cited in findings
- SOLID and OO-design principles
- Ruby and Rails canon

## Resources from Fowler's Enterprise Application Patterns guide

Everything linked from Fowler's
[map of the enterprise-patterns literature](https://martinfowler.com/articles/enterprisePatterns.html):

1. **[Patterns of Enterprise Application Architecture (PoEAA) catalog](https://martinfowler.com/eaaCatalog/).**
   Enterprise application architecture within a layered architecture: domain
   logic, web presentation, database interaction, offline concurrency, and
   distribution patterns. All 51 patterns are documented with Rails mappings in
   the `references/poeaa-*.md` files of this skill.
2. **[Core J2EE Patterns](http://www.corej2eepatterns.com/).** Enterprise
   architecture patterns for Java; the principles (Service Locator, Session
   Facade, DAO) transfer to other platforms, including Rails.
3. **[Enterprise Integration Patterns](http://www.enterpriseintegrationpatterns.com/)**
   (Hohpe and Woolf). The foundational collection for asynchronous messaging
   between applications. Cite for background-job and message-queue findings:
   message channel, competing consumers, idempotent receiver, dead letter
   channel.
4. **[Microsoft Enterprise Solution Patterns](<https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff647095(v=pandp.10)>).**
   Web presentation, deployment, and distributed-systems patterns. (Fowler's
   original msdn.microsoft.com link moved to the learn.microsoft.com archive.)
5. **[Microsoft Data Patterns](<https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff648420(v=pandp.10)>).**
   Data movement: replication and synchronization.
6. **[Microsoft Integration Patterns](<https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff647309(v=pandp.10)>).**
   Integration-layer strategies, system connections, and topologies.
7. **[Domain-Driven Design](http://domainlanguage.com/)** (Eric Evans). Patterns
   for rich object-oriented domain models: Entities, Value Objects, Aggregates,
   Repositories, Bounded Contexts, Ubiquitous Language. Cite for
   anemic-domain-model and aggregate-boundary findings.
8. **[Analysis Patterns](https://martinfowler.com/books/ap.html)** (Fowler).
   Common domain model structures (quantities, measurements, accounting,
   parties). Cite when a domain concept (money, date range, quantity) is smeared
   across primitives.
9. **[Data Model Patterns](https://www.amazon.com/exec/obidos/ASIN/0932633293)**
   (David Hay). Common patterns in data models, for both object and relational
   modeling. Cite for schema-level findings.
10. **[Design Patterns: Elements of Reusable Object-Oriented Software](https://www.amazon.com/exec/obidos/ASIN/0201633612/)**
    (Gang of Four). Strategy, Observer, Decorator, Template Method, Factory,
    Adapter, and others. Cite for OO-design findings PoEAA does not cover.
11. **[Pattern-Oriented Software Architecture (POSA)](https://www.amazon.com/exec/obidos/ASIN/0471958697)**
    (Buschmann et al.). Architectural patterns: Layers and Pipes and Filters
    underpin the layered architecture Rails assumes. Cite for layering
    violations.

Related pages Fowler links from the same article:

- [IEEE Software column on patterns](https://martinfowler.com/ieeeSoftware/patterns.pdf)
- [Enterprise Architecture (bliki)](https://martinfowler.com/bliki/EnterpriseArchitecture.html),
  which contrasts enterprise architecture with enterprise _application_
  architecture

## Fowler bliki entries often cited in findings

- [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)
- [Code Smell](https://martinfowler.com/bliki/CodeSmell.html)
- [Technical Debt](https://martinfowler.com/bliki/TechnicalDebt.html)
- [Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html)
- [CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Refactoring catalog](https://refactoring.com/catalog/): Extract Class,
  Replace Conditional with Polymorphism, Introduce Parameter Object, Replace
  Primitive with Object, and more

## SOLID and OO-design principles

- [Single Responsibility Principle](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- [Open-Closed Principle](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle)
- [Liskov Substitution Principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle)
- [Interface Segregation Principle](https://en.wikipedia.org/wiki/Interface_segregation_principle)
- [Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [SOLID overview](https://web.archive.org/web/20150906155800/http://www.objectmentor.com/resources/articles/Principles_and_Patterns.pdf)
  (Robert C. Martin's original articles)
- [Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter)
  ([original paper](https://www2.ccs.neu.edu/research/demeter/papers/law-of-demeter/oopsla88-law-of-demeter.pdf))
- [Tell, Don't Ask](https://martinfowler.com/bliki/TellDontAsk.html)

## Ruby and Rails canon

- [Rails Guides](https://guides.rubyonrails.org/): cite the specific guide
  (Active Record Querying, Callbacks, Validations, Caching, Security).
- [Rails Security Guide](https://guides.rubyonrails.org/security.html): SQL
  injection, mass assignment, XSS.
- [Rails API docs](https://api.rubyonrails.org/)
- [Ruby Style Guide](https://rubystyle.guide/) (community)
- [Rails Style Guide](https://rails.rubystyle.guide/) (community)
- [rubocop-rails docs](https://docs.rubocop.org/rubocop-rails/): each cop page
  documents its rationale.
- [Practical Object-Oriented Design in Ruby (POODR)](https://www.poodr.com/),
  Sandi Metz
- [Sandi Metz's rules](https://thoughtbot.com/blog/sandi-metz-rules-for-developers):
  100-line classes, 5-line methods, 4 parameters, 1 instance variable per view.
- [Rails AntiPatterns](https://www.oreilly.com/library/view/railstm-antipatterns-best/9780321620293/),
  Pytel and Saleh
- [thoughtbot: ActiveRecord callback guidelines](https://thoughtbot.com/blog/activerecord-callbacks-cause-more-problems-than-theyre-worth)
- [7 patterns to refactor fat ActiveRecord models](https://codeclimate.com/blog/7-ways-to-decompose-fat-activerecord-models)
- [Rails guide on eager loading (N+1 queries)](https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations)
