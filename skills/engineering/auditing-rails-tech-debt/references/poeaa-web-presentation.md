# PoEAA: Web Presentation Patterns

Source: the Web Presentation Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Model View Controller
- Page Controller
- Front Controller
- Template View
- Transform View
- Two Step View
- Application Controller

## Model View Controller

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/modelViewController.html)):
  "Splits user interface interaction into three distinct roles."
- **Rails relevance:** the framework's organizing pattern. The audit hunts role
  bleed in both directions: domain logic in controllers and views, and
  presentation (HTML, URL helpers, flash copy) in models.

**Fix:** The model exposes state; a helper renders it.

**Finding rule:** grep models for `html_safe`, `tag.`, `<span`, `link_to`, and
`Rails.application.routes`; grep views and controllers for business rules. Cite
MVC. (`html_safe` on interpolated strings also cites the Rails Security Guide on
XSS.)

## Page Controller

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/pageController.html)): "An
  object that handles a request for a specific page or action on a Web site."
- **Rails relevance:** each controller action is a Page Controller. Smell: one
  action serving many logical pages through param switches, an unnamed router
  inside the controller.

**Fix:** One page, one controller action; routing belongs to the router.

**Finding rule:** flag actions branching on params to render different templates
or run unrelated logic. Cite Page Controller.

## Front Controller

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/frontController.html)): "A
  controller that handles all requests for a Web site."
- **Rails relevance:** the Rails router and middleware stack are the Front
  Controller. Smell: re-implementing front-controller concerns (authentication,
  tenant resolution, locale) as copy-pasted per-controller code instead of
  centralizing them.

**Fix:** Centralize in the front-controller layer: base controller filters or middleware.

**Finding rule:** flag repeated cross-cutting request logic across actions. Cite
Front Controller and DRY.

## Template View

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/templateView.html)): "Renders
  information into HTML by embedding markers in an HTML page."
- **Rails relevance:** ERB and Haml. Fowler warns that the danger is complicated
  logic in the page. That is the smell: conditionals, queries, and calculations
  in templates.

**Fix:** The view reads intention-revealing methods; logic lives in the model.

**Finding rule:** flag multi-clause conditionals, arithmetic, and any
ActiveRecord query in templates. Sandi Metz's one-instance-variable-per-view
rule is the companion citation. Cite Template View and the Sandi Metz rules.

## Transform View

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/transformView.html)): "A view
  that processes domain data element by element and transforms it into HTML."
- **Rails relevance:** in Rails the transform style shows up in JSON rendering:
  Jbuilder templates or serializers transform domain objects element by element.
  Smell: hand-built nested hashes in controllers, or `to_json` on raw models
  leaking columns.

**Fix:** The transform lives in the view layer; use the app's serializer library instead if it has one.

**Finding rule:** flag inline hash-building in `render json:` beyond trivial
cases, and bare `render json: model` (serializes every column, a data exposure).
Cite Transform View and Data Transfer Object.

## Two Step View

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/twoStepView.html)): "Turns
  domain data into HTML in two steps: first by forming some kind of logical
  page, then rendering the logical page into HTML."
- **Rails relevance:** layouts, partials, and presenters approximate step one;
  ViewComponent formalizes it. Smell: global look and feel duplicated per page,
  so a sitewide change touches every template.

**Fix:** The logical element defined once in a layout partial, rendered consistently.

**Finding rule:** flag structural markup duplicated across many templates. Cite
Two Step View.

## Application Controller

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/applicationController.html)): "A
  centralized point for handling screen navigation and the flow of an
  application."
- **Rails relevance:** _not_ `ApplicationController` the base class. This is a
  flow controller for multi-step processes (wizards, checkouts, onboarding).
  Smell: flow state and next-step decisions scattered across actions and session
  flags.

**Fix:** Flow decisions in one place, as pure functions of the order.

**Finding rule:** flag navigation decisions computed from session flags in
several actions. Cite Application Controller.
