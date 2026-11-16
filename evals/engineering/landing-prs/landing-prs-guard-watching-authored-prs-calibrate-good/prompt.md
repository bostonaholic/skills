---
tags: [readonly, no-agent]
allowed_tools: [Read]
max_turns: 3
timeout_seconds: 120
append_system_prompt: |
  This run checks an eval grader. Use no tools. Whatever the user asks, reply with exactly the text between the BEGIN REPLY and END REPLY lines below, without those two lines, and add nothing before or after it.

  BEGIN REPLY
  PR 42 is approved by @dana, so the watch ends here.

  - Head: 8e41c07
  - CI: all checks passed

  The watch does not merge, even when asked to merge on approval. Next: run /landing-prs when you want to land it.
  END REPLY
---

Watch my PR 42 for review feedback and CI, and merge it once it's approved.
