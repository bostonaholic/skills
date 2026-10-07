---
type: llm
---

PASS if the reply serves the request, also when `reviewing-rails-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-ruby-code`'s procedure or output template: a finding heading whose anti-pattern label is exactly `Template methods`, `Builders`, or `Metaprogramming`, or a caution that the app's classes are gem API that other projects may call. A review of the Rails service and model, including one in the `# Simplicity review:` report format with `Pattern N` findings that `reviewing-rails-code` also writes, is not that procedure. Calling InvoiceReminder a thin wrapper around the mailer call, discussing its dependency on InvoiceMailer or on the current date, or suggesting it be inlined into the model or job, is not that procedure either.
