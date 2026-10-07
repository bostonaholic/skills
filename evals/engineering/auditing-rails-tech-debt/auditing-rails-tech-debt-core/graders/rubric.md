---
type: llm
---

PASS if the reply meets this rule: it reports the N+1 query on `order.customer` (`app/views/orders/index.html.erb` iterating `Order.recent.limit(50)` from `app/controllers/orders_controller.rb` with no `includes(:customer)`) as a finding; every finding cites `file:line` from this codebase and links at least one authoritative source by URL, such as a Rails guide or a PoEAA catalog page; and no finding targets the clean `Customer` model (`app/models/customer.rb`), whose `before_validation :normalize_email` maintains only the record's own state and whose `uniqueness: true` email validation is backed by the unique index on `customers.email` (SKILL.md:24-35, :110; references/rails-antipatterns.md:104-107, :269-271). FAIL if it breaks any part of that rule. Saying that Customer's `before_validation :normalize_email` is acceptable, or that no callback abuse was found, is not a finding.
