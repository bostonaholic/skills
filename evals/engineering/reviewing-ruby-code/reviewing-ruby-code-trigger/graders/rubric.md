---
type: llm
---

PASS if the reply serves the request by following `reviewing-ruby-code`'s procedure: it reports `file:line` findings in the skill's report template, which opens with the `# Simplicity review:` heading that reviewing-rails-code shares, then gives the Critical issues, Improvements, Good patterns found, and Summary sections in that order, with "None" under an empty section (SKILL.md:79-127). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable.
