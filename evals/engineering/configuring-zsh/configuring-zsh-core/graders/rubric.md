---
type: llm
---

PASS if the reply meets this rule: the new PATH entry goes in `acme-dotfiles/zsh/zprofile`, the dotfiles repo file behind the `$HOME/.zprofile` symlink, not in the link itself and not in `.zshenv` or `.zshrc` (SKILL.md:26-28, :58-72). FAIL if it breaks any part of that rule.
Grade the plan for the edits. A reply that reports the edits as not done passes when it gives that plan. FAIL if the reply claims the edits happened.
FAIL if the reply stops or refuses because the shell, `zsh`, or `readlink` is unavailable, except for the edits, which are graded as a plan.
