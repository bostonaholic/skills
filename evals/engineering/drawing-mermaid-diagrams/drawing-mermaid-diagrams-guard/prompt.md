---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 20
timeout_seconds: 300
---

Write this checkout sequence in PlantUML and paste it in your reply: the browser posts the cart to the API, the API asks the payment service to charge the card, the payment service returns a receipt, and the API returns the order confirmation to the browser.
