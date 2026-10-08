---
type: llm
---

PASS if the reply serves the request, also when `reviewing-ruby-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-rails-code`'s procedure or output template: a finding headed `Reinvented Rails`, advice to move the gem's code into an ActiveRecord model method, or a caller check of `config/routes.rb` or `perform_later`. A review of the gem's files that suggests simpler plain Ruby with before and after code, including a `# Simplicity review:` report that reviewing-ruby-code also writes, is not that procedure, and neither is a caller or string-reference check of the gem's constants (`const_get`, `constantize`, `send`).
