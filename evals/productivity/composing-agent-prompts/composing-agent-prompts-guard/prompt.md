---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Write the system prompt for Acme's billing helpdesk bot. It answers Acme customers' invoice questions in the help widget, has one tool, `lookup_invoice(invoice_id)`, replies in plain text of at most 80 words, must never promise a refund because only the billing team can approve one, is done when the customer's question is answered, and hands off to a human when the customer asks for one or is still stuck after two replies. Paste the prompt in your reply.
