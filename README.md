# Skills

<!-- generated:start -->

The skills I use to build software with coding agents.

## Install

Copy/paste into your CLI prompt:

```text
Install the skills from https://github.com/bostonaholic/skills, refer to the repo's AGENTS.md for instructions.
```

Or follow the [installation instructions](INSTALL.md).

## Skills

### Engineering

- **[addressing-pr-comments](./skills/engineering/addressing-pr-comments/SKILL.md)**: Triage and address open PR feedback. Calls: `attaching-pr-screenshots`.
- **[attaching-pr-screenshots](./skills/engineering/attaching-pr-screenshots/SKILL.md)**: Attach local images to a PR body.
- **[auditing-agent-token-usage](./skills/engineering/auditing-agent-token-usage/SKILL.md)**: Audit Claude Code and Codex token and context costs.
- **[auditing-complexity](./skills/engineering/auditing-complexity/SKILL.md)**: Rank code complexity hotspots and CRAP change risk.
- **[auditing-rails-tech-debt](./skills/engineering/auditing-rails-tech-debt/SKILL.md)**: Audit a Rails app for cited tech debt findings. Calls: `simplifying-ruby-code`.
- **[auditing-repo-security](./skills/engineering/auditing-repo-security/SKILL.md)**: Audit a third-party repo before running it.
- **[auditing-tests](./skills/engineering/auditing-tests/SKILL.md)**: Audit a test suite for low-value tests.
- **[capturing-screenshots](./skills/engineering/capturing-screenshots/SKILL.md)**: Capture verified screenshots of an app.
- **[configuring-zsh](./skills/engineering/configuring-zsh/SKILL.md)**: Place zsh config in the right startup file.
- **[diagnosing-react-code](./skills/engineering/diagnosing-react-code/SKILL.md)**: Scan a React package and fix its errors.
- **[drawing-mermaid-diagrams](./skills/engineering/drawing-mermaid-diagrams/SKILL.md)**: Write, render, and debug Mermaid diagrams.
- **[explaining-architecture](./skills/engineering/explaining-architecture/SKILL.md)**: Explain how a subsystem or runtime flow works. Calls: `investigating-design-rationale`.
- **[explaining-code](./skills/engineering/explaining-code/SKILL.md)**: Explain a PR, diff, or code briefly or in full. Calls: `explaining-architecture`.
- **[fixing-root-causes](./skills/engineering/fixing-root-causes/SKILL.md)**: Trace each symptom to its root and fix it there.
- **[freeing-disk-space](./skills/engineering/freeing-disk-space/SKILL.md)**: Find what fills the disk and clear regenerable files.
- **[grooming-backlogs](./skills/engineering/grooming-backlogs/SKILL.md)**: Plan backlog grooming changes for approval.
- **[investigating-design-rationale](./skills/engineering/investigating-design-rationale/SKILL.md)**: Investigate why code is shaped as it is. Calls: `explaining-architecture`.
- **[landing-prs](./skills/engineering/landing-prs/SKILL.md)**: Land a reviewed pull request on explicit request.
- **[merging-dependabot-prs](./skills/engineering/merging-dependabot-prs/SKILL.md)**: Plan and merge safe Dependabot updates one at a time, or only request rebases. Explicit invocation only.
- **[proving-claims](./skills/engineering/proving-claims/SKILL.md)**: Prove claims or a PR test plan with rated evidence.
- **[rebasing-branches](./skills/engineering/rebasing-branches/SKILL.md)**: Rebase the current branch onto its base and force-push with a lease. Explicit invocation only.
- **[rebasing-open-prs](./skills/engineering/rebasing-open-prs/SKILL.md)**: Rebase all open pull requests onto their bases after confirmation. Explicit invocation only.
- **[redoing-implementations](./skills/engineering/redoing-implementations/SKILL.md)**: Rebuild the current work as a simpler design. Explicit invocation only.
- **[removing-comments](./skills/engineering/removing-comments/SKILL.md)**: Remove low-value source comments, encoding constraints with approval. Explicit invocation only.
- **[reviewing-code](./skills/engineering/reviewing-code/SKILL.md)**: Review a diff in a fresh-context read-only subagent.
- **[reviewing-design-docs](./skills/engineering/reviewing-design-docs/SKILL.md)**: Adversarially review a technical design document.
- **[simplifying-ruby-code](./skills/engineering/simplifying-ruby-code/SKILL.md)**: Find or fix over-engineered Ruby and Rails code.
- **[summarizing-friction-logs](./skills/engineering/summarizing-friction-logs/SKILL.md)**: Prioritize frog friction logs across a workspace.
- **[using-gh-cli](./skills/engineering/using-gh-cli/SKILL.md)**: Open PRs, check CI, and handle issues through gh, verifying each result. Calls: `landing-prs`.
- **[verifying-production-changes](./skills/engineering/verifying-production-changes/SKILL.md)**: Confirm a merged change took effect in production.
- **[watching-authored-prs](./skills/engineering/watching-authored-prs/SKILL.md)**: Watch your own PR for review feedback and CI. Calls: `addressing-pr-comments`.
- **[watching-reviewed-prs](./skills/engineering/watching-reviewed-prs/SKILL.md)**: Watch a PR you reviewed and approve once feedback settles. Explicit invocation only.
- **[writing-technical-design-docs](./skills/engineering/writing-technical-design-docs/SKILL.md)**: Draft a directionally correct technical design doc. Calls: `reviewing-design-docs`.

### Productivity

- **[being-extremely-fucking-brief](./skills/productivity/being-extremely-fucking-brief/SKILL.md)**: Keep every response extremely brief.
- **[composing-agent-prompts](./skills/productivity/composing-agent-prompts/SKILL.md)**: Compose a source-cited task prompt for another agent. Calls: `improving-prompts`.
- **[conducting-deep-research](./skills/productivity/conducting-deep-research/SKILL.md)**: Research an evidence review plus a funding map.
- **[cutting-skills](./skills/productivity/cutting-skills/SKILL.md)**: Audit or trim an agent skill to its behavioral core.
- **[improving-prompts](./skills/productivity/improving-prompts/SKILL.md)**: Compress and clarify an existing prompt.
- **[learning-from-mistakes](./skills/productivity/learning-from-mistakes/SKILL.md)**: Turn a correction into an approved instructions-file rule.
- **[pricing-creativity](./skills/productivity/pricing-creativity/SKILL.md)**: Price creative work by value with Blair Enns's frameworks.
- **[running-retros](./skills/productivity/running-retros/SKILL.md)**: Mine a session or named sources for durable learnings. Explicit invocation only.
- **[summarizing-shipped-work](./skills/productivity/summarizing-shipped-work/SKILL.md)**: Summarize merged PRs into a shipped-work report.
- **[writing-prose](./skills/productivity/writing-prose/SKILL.md)**: Write plain, short prose for people.
- **[writing-system-prompts](./skills/productivity/writing-system-prompts/SKILL.md)**: Write or review a system prompt.

<!-- generated:end -->

## Docs

Browse the [skill catalog](https://skills.bostonaholic.dev) for usage and installation instructions.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. See [README and site maintenance](docs/catalog.md) for documentation changes and [versioning and releases](docs/versioning.md) for publishing.

## License

MIT. See [LICENSE](LICENSE).

## Deprecated

Retired skills are preserved in [skills/deprecated](skills/deprecated/README.md) and excluded from installation.
