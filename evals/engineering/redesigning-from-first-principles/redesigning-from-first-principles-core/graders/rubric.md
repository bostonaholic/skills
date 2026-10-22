---
type: llm
---

PASS if the reply meets this rule: it names the broken assumption that every notification is an email, describes a target design as if per-user channel choice had been a founding assumption, says what a bolt-on (such as an `if user.sms?` branch inside `Notifier#deliver` beside the mailer) would leave behind, lists increments that each leave the tests passing, plans to update every reference to the old assumption including the email-only rationale in docs/notifications.md, the "Sends every user notification by email" comment, and test/notifier_test.rb, and waits for approval before editing (SKILL.md:13-33). FAIL if it breaks any part of that rule, or reports any file as already edited.
