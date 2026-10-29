# Deprecated

Archived skills kept for reference. They are excluded from the active catalog and plugin.
Entrypoints use `SKILL.md.disabled` so recursive skill installers do not discover them.
Their shared files are frozen copies and are not updated by `sync-shared`.

- [bd-go](bd-go/SKILL.md.disabled): retired Beads task execution.
- [bd-scan](bd-scan/SKILL.md.disabled): retired Beads branch scanning.
- [pr-cleanup](pr-cleanup/SKILL.md.disabled): retired standalone post-PR cleanup. Its original teardown declaration and variables are preserved in the archive.
- [rebasing-branches](rebasing-branches/SKILL.md.disabled): renamed to `modernizing-prs`, which owns its scripts.
- [rebasing-dependabot-prs](rebasing-dependabot-prs/SKILL.md.disabled): retired; its rebase-only flow is now a mode of `merging-dependabot-prs`.
- [rebasing-open-prs](rebasing-open-prs/SKILL.md.disabled): retired; no skill updates every open PR at once.
- [reviewing-rails-code](reviewing-rails-code/SKILL.md.disabled): retired; its review mode is now part of `simplifying-ruby-code`.
- [reviewing-ruby-code](reviewing-ruby-code/SKILL.md.disabled): retired; its review mode is now part of `simplifying-ruby-code`.
- [using-gh-cli](using-gh-cli/SKILL.md.disabled): retired; evals showed it rarely triggered and current models handle its gh cases without it.
- [using-jq](using-jq/SKILL.md.disabled): retired; current models already know its jq gotchas.

To reactivate a skill, move it to `skills/engineering/<name>/` or `skills/productivity/<name>/`, rename `SKILL.md.disabled` to `SKILL.md`, update the plugin manifest, and regenerate shared copies and the catalog.
