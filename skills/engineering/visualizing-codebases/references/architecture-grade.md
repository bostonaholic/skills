# Architecture grade

`scripts/build-c4-site.mjs` computes the grade from `c4-model.json`. Never compute or estimate a letter yourself.
The grade is a heuristic over the structure in the model, not a measure of whether the system meets its needs.

## Contents

- How the letter is computed
- Caps
- When no letter is given
- What the build prints
- Measured criteria
- Questions
- Convention and layers
- Ecosystem notes
- Sources

## How the letter is computed

- Points are hundredths of 4. A measured criterion earns A 400, B 300, C 200, D 100, or F 0 from its band.
- A judged criterion earns `floor(400 x yes / (yes + no))` from its questions' answers. An n/a answer leaves the share. Its letter comes from the scale below.
- The mean is the weighted mean of the applicable criteria's points, floored to whole points. A criterion that is n/a leaves the mean, weight and all.
- The scale is A from 350, B from 250, C from 150, D from 50, and F below 50. stdout prints the mean as points of 4, so 317 prints as 3.17.
- A value equal to a band's upper edge lands in that band. Band checks compare integers, so no rounding moves a value across an edge. Percentages in stdout are for display only.

## Caps

A cap sets the highest letter the grade can get. The final letter is the worse of the mean's letter and the letter of every cap that fired. Each cap fires on a measured cycle fact:

- `container-cycle`, C: a cycle joins containers. Source: the Acyclic Dependencies Principle at container scale, and Newman on distributed monoliths.
- `component-cycle`, B: a cycle joins components, so a model with any component cycle never gets an A. Source: Martin's Acyclic Dependencies Principle.
- `tangled-components`, D: one component-level cycle holds more than half of the components. A cycle that holds exactly half does not fire it. Source: Foote and Yoder, "Big Ball of Mud".

The cycle facts are whether a container cycle exists, the count of components in component cycles, the size of the largest component cycle, and the count of code elements in code cycles. Take two models with the same elements and equal values for every criterion that is not about cycles. When each cycle fact of the second is at least the first's, the second never grades higher.

That property does not cover every change. A change can move cycle members from one level to another, split one tangled cycle in two, or add cycle edges that also change `stable-dependencies`. Any of these can raise the letter.

## When no letter is given

The build checks these reasons in order and prints the first that holds:

1. the model has no architecture section
2. fewer than 4 components
3. fewer than 10 code elements
4. more than half of the code elements have no relationship, so the imports look incomplete

A code element has no relationship when no entry in `relationships` names it as `from` or `to`.

## What the build prints

After the cycle lines, stdout prints the `grade:` line, then one line per criterion, then one `cap` line per cap that fired. With no letter, it prints `grade: none (<reason>)` and no criterion line. A criterion that does not apply prints `n/a` and the reason in place of a letter and value. The shape, with illustrative values:

```text
grade: B (2.59 of 4)
  acyclic-components C: 2 of 12 components in a cycle (16.7%)
  acyclic-code A: 2 of 140 code elements in a cycle (1.4%)
  dependency-direction C: 3 of 96 cross-layer relationships point outward (3.1%)
  stable-dependencies B: 4 of 31 component dependencies point to a less stable component (12.9%)
  propagation-cost B: a code element reaches 14.6% of the code elements on average
  component-balance B: the largest component holds 38 of 140 code elements (27.1%)
  boundaries B: 2 of 3 answers yes
  core-isolation n/a: every answer is n/a
  responsibilities C: 2 of 4 answers yes
  conventions B: 3 of 4 answers yes
  cap component-cycle B: a cycle joins components (cycle-1)
```

## Measured criteria

The build measures these from the rolled-up levels. Each band edge is an inclusive upper edge. "cited" names the published source that sets the edge, and "proposal" marks an edge this skill chose without a published source.

- `acyclic-components`, weight 20, always applies once graded.
  - Measure: the share of components inside a component-level cycle.
  - Bands: A 0% (cited: Martin, Acyclic Dependencies Principle), B 10% (proposal), C 25% (proposal), D 50% (proposal), F above 50%.
  - Source: Martin's Acyclic Dependencies Principle allows no cycle in the component graph.
- `acyclic-code`, weight 10, always applies once graded.
  - Measure: the share of code elements inside a code-level cycle.
  - Bands: A 2%, B 10%, C 30%, D 60% (all proposal), F above 60%.
  - Source: the Acyclic Dependencies Principle at file scale. Sas, Avgeriou, and Uyumaz report that most cycles in the industrial systems they studied sit among files, not components.
- `dependency-direction`, weight 15, applies when `architecture.layers` is set and one or more relationships cross layers.
  - Measure: the share of cross-layer relationships that point outward, to a layer earlier in `layers`. It counts merged relationships, so a component edge that merges 5 imports counts 5, because it measures how many imports break the layer order.
  - Bands: A 0% (cited: Martin, the Dependency Rule), B 1% (proposal), C 5% (proposal), D 20% (proposal), F above 20%.
  - Source: Martin's Dependency Rule says source code dependencies point only inward. Cockburn's hexagonal architecture and Palermo's onion architecture state the same constraint with other ring names.
- `stable-dependencies`, weight 10, applies when one or more dependencies join two components.
  - Measure: the share of component dependencies from A to B where B is less stable than A, that is, I(B) > I(A). Instability is I = Ce / (Ca + Ce). Ca counts the other components that depend on a component, and Ce counts the other components it depends on. Each counts distinct neighbors: a component edge adds 1 whatever its merged count. Equal instability is not a violation.
  - Bands: A 5%, B 15%, C 30%, D 50% (all proposal), F above 50%.
  - Source: Martin's Stable Dependencies Principle. dependency-cruiser and NDepend define instability by the same formula.
- `propagation-cost`, weight 10, applies from 50 through 5000 code elements.
  - Measure: the mean share of code elements that each code element reaches through relationships, itself included. Under 50 code elements, the element reaching itself already weighs more than 2%. Above 5000, one search per code element makes the build slow, so the criterion is n/a.
  - Bands: A 10%, B 20%, C 35%, D 50% (all proposal), F above 50%.
  - Source: MacCormack, Rusnak, and Baldwin define propagation cost and report 5.8% for a Linux release and 17.35% for Mozilla before its redesign, 2.78% after.
- `component-balance`, weight 5, applies from 5 components.
  - Measure: the share of code elements in the largest component. Under 5 components, the largest holds more than 20% by arithmetic alone.
  - Bands: A 20%, B 30%, C 40%, D 60% (all proposal), F above 60%.
  - Source: Lippert and Roock name a component much larger than the others as an architecture smell.

## Questions

Answer every question in `architecture.answers` against the convention in `architecture.convention`. Each answer is `yes`, `no`, or `n/a`, where the question allows n/a. Every answer cites one or more files, `path:line` locations, or short facts as evidence. A `no` cites what breaks the rule. An `n/a` cites what you checked. Yes always conforms.

Boundaries (`boundaries`, weight 10):

- `public-entry`: yes when code in one component uses another only through its public entry: the exported API, an index or barrel file, or a non-internal package. Cite the entry files, or an import that bypasses one. Never n/a.
- `one-writer-per-store`: yes when one container writes each datastore the system owns. Cite the code that writes each store. n/a when the system has one container or owns no datastore.
- `explicit-contracts`: yes when containers call each other through declared contracts: routes, OpenAPI, protobuf, a GraphQL schema, or message types. Cite the contract files. n/a when the system has one container.

Core isolation (`core-isolation`, weight 5):

- `framework-free-core`: yes when the innermost layer imports no web framework, HTTP client, queue, or filesystem library, except what the convention puts there, such as ActiveRecord in Rails models. Cite the core's imports. n/a when the codebase has no business core, such as a CRUD proxy.
- `core-owns-ports`: yes when the core declares the interfaces it calls outward, such as repositories, gateways, and notifiers, and code outside it implements them. Cite an interface and an implementation. n/a when the codebase has no business core.
- `rules-in-core`: yes when business rules live in the core, not in controllers, handlers, views, or jobs. Cite where the rules live. n/a when the codebase has no business core.

Responsibilities (`responsibilities`, weight 10):

- `single-purpose`: yes when each component's purpose fits in one sentence without "and". Cite the component whose purpose needs "and". Never n/a.
- `no-catch-all`: yes when no component is a catch-all of unrelated code, such as `utils`, `common`, `helpers`, `shared`, or `misc`. Cite the catch-all directory. Never n/a.
- `no-god-modules`: yes when no class or module mixes unrelated concerns, such as request handling, SQL, and rendering in one file. Cite the file. Never n/a.
- `no-hollow-layers`: yes when abstractions add behavior: no interface with one implementation away from a boundary, and no layer whose methods only forward to the next. Cite the interface or the forwarding layer. Never n/a.

Conventions (`conventions`, weight 5):

- `follows-convention`: yes when the layout follows the convention named in `architecture.convention`. Cite the directories that match or break it. n/a only when no convention applies, as "Convention and layers" below says.
- `one-mechanism-per-concern`: yes when each cross-cutting concern, such as HTTP clients, configuration, logging, errors, and persistence access, uses one mechanism. Cite the second mechanism for a concern. Never n/a.
- `rules-checked`: yes when a tool or the compiler checks dependency rules: import-linter, ArchUnit, dependency-cruiser, Nx module boundaries, Packwerk, Go `internal/`, Java or Kotlin modules, or Rust crates. Cite the config file. Never n/a.
- `docs-match`: yes when the architecture docs name the containers and components the model found, with no contradiction. Cite the doc and any contradiction. n/a when the repository has no architecture docs.

An example of the section:

```json
{
  "architecture": {
    "convention": "Express service, layered as the README states",
    "answers": {
      "public-entry": { "answer": "yes", "evidence": ["src/orders/index.ts", "src/billing/index.ts"] },
      "one-writer-per-store": { "answer": "n/a", "evidence": ["one container"] },
      "single-purpose": { "answer": "no", "evidence": ["src/billing/ renders invoice HTML and charges cards"] },
      "rules-checked": { "answer": "yes", "evidence": [".dependency-cruiser.cjs"] }
    }
  }
}
```

The example shows part of a section. A real section answers every question above.

## Convention and layers

- Take `convention` from the repository's declared architecture first: docs, ADRs, and rule configs for import-linter, ArchUnit, dependency-cruiser, Nx tags, or Packwerk. Otherwise use the framework's or the language's convention. Say where it came from, such as "Rails MVC, from the Gemfile and the app/ layout".
- When neither exists, write in `convention` that no convention applies and why, such as "none: no architecture docs or rule configs, and plain Node scripts have no standard layout". Then answer `follows-convention` n/a, with evidence that names what you checked.
- Libraries are not in the model, so an import of a framework is never an edge. `framework-free-core` exempts what the convention puts in the core.
- Set `architecture.layers` when the convention or the docs give one layer order. List the layers outermost first. A dependency from one layer to the same layer or a later one is allowed.
- The composition root, such as `main` or dependency-injection modules, sits in the outermost layer, so wiring every layer is not an outward edge. A shared utility component sits in the innermost layer.
- Once `layers` is set, every component names its `layer`.
- Leave `layers` out when one order does not fit the system, such as services with different layer orders.
- When the user declines the grade, leave out `layers` and every component `layer` too, with the rest of the section.

## Ecosystem notes

- Rails and Django: ORM models are the convention's core, so a model that uses ActiveRecord or the Django ORM is not a framework leak. Judge `rules-in-core` against the models, not against a separate domain layer the convention does not ask for.
- Go: the compiler forbids package import cycles, and Rust forbids crate cycles. Grade the cycles the model holds anyway: the grade describes the structure, and file-level cycles stay possible.
- Go: an `internal/` directory is a compiler-checked boundary, so it counts for `public-entry` and `rules-checked`. Go declares interfaces on the consumer side, so for `core-owns-ports` look for interfaces in the package that calls them.
- TypeScript: a package's barrel file, such as `index.ts`, is its public entry for `public-entry`. A deep import past the barrel is a no.
- Nx: tags count for `rules-checked` only when `depConstraints` in the lint config name real tags. A workspace with every project tagged `*`, or no `depConstraints`, has no checked rule.
- Dependency injection: modules that bind implementations, such as Spring configuration, Guice modules, or Dagger components, are the composition root. Put them in the outermost layer.
- Misk: `main` passes Guice modules to `MiskApplication`, so those modules are the composition root, in the outermost layer. Web actions, classes that extend `WebAction`, are the endpoints, also in the outermost layer.

## Sources

- Robert C. Martin, _Clean Architecture: A Craftsman's Guide to Software Structure and Design_, Prentice Hall, 2017. The component principles, including the Acyclic Dependencies Principle behind the cycle criteria and the cycle caps, the Stable Dependencies Principle, the Common Closure Principle, and the Common Reuse Principle.
- Robert C. Martin, "The Clean Architecture", 2012, on the Dependency Rule: <https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>.
- Alistair Cockburn, "Hexagonal architecture", 2005: <https://alistair.cockburn.us/hexagonal-architecture/>.
- Jeffrey Palermo, "The Onion Architecture, part 1", 2008: <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/>.
- Sas, Avgeriou, and Uyumaz, "On the evolution and impact of architectural smells", Empirical Software Engineering 27(4), 2022: <https://arxiv.org/abs/2203.08702>.
- David L. Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules", Communications of the ACM 15(12), 1972: <https://dl.acm.org/doi/10.1145/361598.361623>.
- Simon Brown, "The Missing Chapter" in _Clean Architecture_, and "Modular monolith": <https://simonbrown.je/modular-monolith/>.
- Sam Newman, _Monolith to Microservices_, O'Reilly, 2019, on shared databases and on distributed monoliths, services that must deploy together, as summarized by InfoQ: <https://www.infoq.com/news/2020/05/monolith-decomposition-newman/>.
- Alan MacCormack, John Rusnak, and Carliss Baldwin, "Exploring the Structure of Complex Software Designs", Management Science 52(7), 2006: <https://www.hbs.edu/ris/Publication%20Files/05-016.pdf>.
- Martin Lippert and Stefan Roock, _Refactoring in Large Software Projects_, Wiley, 2006, on architecture smells.
- Brian Foote and Joseph Yoder, "Big Ball of Mud", PLoP, 1997: <http://www.laputan.org/mud/>.
- Stevens, Myers, and Constantine, "Structured Design", IBM Systems Journal 13(2), 1974, on cohesion.
- Michele Lanza and Radu Marinescu, _Object-Oriented Metrics in Practice_, Springer, 2006, on god classes: <https://beckassets.blob.core.windows.net/product/readingsample/187724/9783540244295_excerpt_001.pdf>.
- John Ousterhout, _A Philosophy of Software Design_, 2nd ed., 2021, on shallow modules and pass-through methods: <https://yingang.github.io/aposd2e-zh/en/summary.html>.
- Martin Fowler, _Refactoring_, 2nd ed., Addison-Wesley, 2018.
- Carola Lilienthal, _Sustainable Software Architecture_, dpunkt, 2019, on pattern consistency: <https://kmaxat.com/blog/modularity-maturity-index.html>.
- Neal Ford, Rebecca Parsons, and Patrick Kua, _Building Evolutionary Architectures_, on fitness functions: <https://nealford.com/books/buildingevolutionaryarchitectures.html>.
- Instability, I = Ce / (Ca + Ce): the dependency-cruiser rules reference <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md> and the NDepend code metrics <https://www.ndepend.com/docs/code-metrics>.
- Misk, "Getting started", on Guice modules and web actions: <https://github.com/cashapp/misk/blob/master/docs/getting-started.md>.
- Rule tools: ArchUnit <https://www.archunit.org/userguide/html/000_Index.html>, dependency-cruiser <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>, import-linter <https://import-linter.readthedocs.io/en/stable/contract_types/>, Nx <https://nx.dev/features/enforce-module-boundaries>, Packwerk <https://github.com/Shopify/packwerk/blob/main/USAGE.md>, and Go internal packages <https://go.dev/doc/go1.4#internalpackages>.
