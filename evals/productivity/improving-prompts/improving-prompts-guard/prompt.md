---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Write a new system prompt, from scratch, for a bot that answers Acme customers' questions about their invoices in the Acme help widget. Its users are Acme customers. It has one tool, `lookup_invoice(invoice_id)`, and must call it before it states any figure from an invoice. It replies in plain text of at most 80 words. It must never promise a refund, because only the billing team can approve one. It is done when the customer's question is answered, and it hands off to a human when the customer asks for one or is still stuck after two replies. Where I've left something out, make a reasonable assumption and note it rather than asking me. Paste the prompt in your reply.
