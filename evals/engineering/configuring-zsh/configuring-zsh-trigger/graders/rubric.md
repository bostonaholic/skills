---
type: llm
---

PASS if the reply serves the request by following `configuring-zsh`'s procedure, which has no output template: it puts `setopt HIST_IGNORE_ALL_DUPS` in `acme-dotfiles/zsh/zshrc`, the dotfiles repo file behind the `$HOME/.zshrc` symlink, not in the link itself or in another startup file (SKILL.md:26-28, :44). FAIL if it answers without that procedure, refuses, or stops because a tool is unavailable, except for the edits, which are graded as a plan.
Grade the plan for the edits. A reply that reports the edits as not done passes when it gives that plan. FAIL if the reply claims the edits happened.
FAIL if the reply stops or refuses because the shell, `zsh`, or `readlink` is unavailable, except for the edits, which are graded as a plan.
