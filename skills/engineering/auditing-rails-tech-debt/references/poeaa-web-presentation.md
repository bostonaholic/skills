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

**Before (smell: presentation inside the model):**

```ruby
class Order < ApplicationRecord
  def status_badge
    color = paid? ? "green" : "red"
    "<span class='badge badge-#{color}'>#{status.titleize}</span>".html_safe
  end
end
```

**After (the model exposes state; a helper renders it):**

```ruby
class Order < ApplicationRecord
  def paid? = status == "paid"
end

# app/helpers/orders_helper.rb
def order_status_badge(order)
  tag.span(order.status.titleize, class: ["badge", order.paid? ? "badge-green" : "badge-red"])
end
```

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

**Before (smell: one action, many pages):**

```ruby
class DashboardController < ApplicationController
  def show
    case params[:view]
    when "sales"   then @data = SalesReport.new(current_user); render :sales
    when "traffic" then @data = TrafficReport.new(current_user); render :traffic
    else                @data = OverviewReport.new(current_user); render :overview
    end
  end
end
```

**After (one page, one controller action; routing belongs to the router):**

```ruby
# config/routes.rb
namespace :dashboard do
  resource :sales, :traffic, :overview, only: :show
end

class Dashboard::SalesController < ApplicationController
  def show = @data = SalesReport.new(current_user)
end
```

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

**Before (smell: cross-cutting request handling duplicated per controller):**

```ruby
class OrdersController < ApplicationController
  def index
    redirect_to login_path and return unless session[:user_id]
    I18n.locale = params[:locale] || :en
    @tenant = Tenant.find_by!(subdomain: request.subdomain)
    ...
  end
end
# same 3 lines in 30 other actions
```

**After (centralize in the front-controller layer: base controller filters or
middleware):**

```ruby
class ApplicationController < ActionController::Base
  before_action :require_login, :set_locale, :set_tenant
end
```

**Finding rule:** flag repeated cross-cutting request logic across actions. Cite
Front Controller and DRY.

## Template View

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/templateView.html)): "Renders
  information into HTML by embedding markers in an HTML page."
- **Rails relevance:** ERB and Haml. Fowler warns that the danger is complicated
  logic in the page. That is the smell: conditionals, queries, and calculations
  in templates.

**Before (smell: a logic-heavy template):**

```erb
<% if @order.line_items.sum { |i| i.price * i.qty } > 100 && @order.user.created_at < 1.year.ago %>
  <% discount = @order.line_items.sum { |i| i.price * i.qty } * 0.1 %>
  <p>Loyalty discount: <%= number_to_currency(discount) %></p>
<% end %>
```

**After (the view reads intention-revealing methods; logic lives in the
model):**

```erb
<% if @order.loyalty_discount? %>
  <p>Loyalty discount: <%= number_to_currency(@order.loyalty_discount) %></p>
<% end %>
```

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

**Before (smell: transformation logic inline in the controller, leaking the
schema):**

```ruby
def show
  order = Order.find(params[:id])
  render json: {
    id: order.id, total: order.total.to_f,
    items: order.line_items.map { |i| { sku: i.sku, qty: i.qty, price: i.price.to_f } },
    customer: { name: order.customer.name, email: order.customer.email }
  }
end
```

**After (the transform lives in the view layer; use the app's serializer library
instead if it has one):**

```ruby
# app/controllers/orders_controller.rb
def show
  @order = Order.includes(:line_items).find(params[:id])
end

# app/views/orders/show.json.jbuilder
json.id @order.id
json.total @order.total.to_s
json.items @order.line_items, :sku, :qty, :price
```

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

**Before (smell: page chrome copy-pasted per template):**

```erb
<%# every show page re-implements the card wrapper %>
<div class="card shadow-md"><div class="card-header"><h2><%= @order.title %></h2></div>
  <div class="card-body">...</div></div>
```

**After (the logical element defined once in a layout partial, rendered
consistently):**

```erb
<%= render layout: "shared/card", locals: { title: @order.title } do %> ... <% end %>
```

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

**Before (smell: wizard flow smeared across actions and the session):**

```ruby
def update_step2
  session[:step2_done] = true
  if session[:wants_shipping] then redirect_to step3_path
  elsif session[:step1_done] && current_user.premium? then redirect_to step4_path
  else redirect_to step2_path, alert: "..." end
end
```

**After (flow decisions in one place, as pure functions of the order):**

```ruby
module CheckoutFlow
  STEPS = %i[cart shipping payment review].freeze

  module_function

  def next_step(order, current)
    STEPS.drop(STEPS.index(current) + 1).find { |step| required?(order, step) }
  end

  def required?(order, step)
    step != :shipping || order.physical_goods?
  end
end

# controller: redirect_to step_path(CheckoutFlow.next_step(@order, :cart))
```

**Finding rule:** flag navigation decisions computed from session flags in
several actions. Cite Application Controller.
