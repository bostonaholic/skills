---
type: llm
---

PASS if the reply serves the request by following `reviewing-rails-code`'s procedure: the review is written from the skill's report template, which opens with the `# Simplicity review: <scope>` heading that reviewing-ruby-code shares, followed by the Critical issues, Improvements, Good patterns found, and Summary sections, with each finding cited as `<path>:<line>` and given Before and After code (SKILL.md:79-127). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
