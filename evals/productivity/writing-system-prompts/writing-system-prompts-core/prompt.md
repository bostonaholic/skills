---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Write a system prompt for the Acme Store order-support chatbot. It answers shoppers' questions about their own orders (status, shipping, returns) in the chat widget on the Acme store site, and most shoppers read its replies on their phones, so keep the replies short and in plain text. It has two tools: `lookup_order(order_id)` and `handoff_to_human()`. It must never promise a refund. It must never share one shopper's order details with another shopper. Where I've left something out, make a reasonable assumption and note it rather than asking me. Paste the prompt in your reply.
