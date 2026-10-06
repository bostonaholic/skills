# Skills

<!-- generated:start -->

The skills I use to build software with coding agents.

## Install

Two ways in. The Claude Code plugin installs every skill as one managed bundle that updates when a new version ships. `npx skills` copies the skills you pick into your project or home directory, for Claude Code, Codex, and other agents; you own and edit the copies. Pick one: installing both gives you every skill twice.

### Claude Code

```sh
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic@skills
```

Update the marketplace first, then the plugin:

```sh
claude plugin marketplace update skills
claude plugin update bostonaholic@skills
```

### Any agent, whole set

```sh
npx skills@latest add bostonaholic/skills
```

Pick the skills you want, and which agents to install them on.

### One skill

```sh
npx skills@latest add bostonaholic/skills --skill <name>
```

To update it:

```sh
npx skills@latest update <name>
```

A skill that calls another skill names it, and stops or falls back when that skill is missing.

## Skills

### Engineering

- **[addressing-pr-comments](./skills/engineering/addressing-pr-comments/SKILL.md)**: Triage unresolved PR review comments. Calls: `attaching-pr-screenshots`.
- **[attaching-pr-screenshots](./skills/engineering/attaching-pr-screenshots/SKILL.md)**: Attach local images to a PR body.
- **[auditing-complexity](./skills/engineering/auditing-complexity/SKILL.md)**: Rank where code complexity concentrates in a codebase.
- **[auditing-repo-security](./skills/engineering/auditing-repo-security/SKILL.md)**: Audit a repository for security risks.
- **[auditing-tests](./skills/engineering/auditing-tests/SKILL.md)**: Audit a test suite for low-value tests.
- **[capturing-screenshots](./skills/engineering/capturing-screenshots/SKILL.md)**: Capture verified screenshots of an app.
- **[configuring-zsh](./skills/engineering/configuring-zsh/SKILL.md)**: Edit zsh configuration in dotfiles.
- **[diagnosing-react-code](./skills/engineering/diagnosing-react-code/SKILL.md)**: Diagnose React codebase issues.
- **[drawing-mermaid-diagrams](./skills/engineering/drawing-mermaid-diagrams/SKILL.md)**: Create and review Mermaid diagrams.
- **[explaining-architecture](./skills/engineering/explaining-architecture/SKILL.md)**: Explain how a subsystem works. Calls: `investigating-design-rationale`.
- **[grooming-backlogs](./skills/engineering/grooming-backlogs/SKILL.md)**: Groom a project backlog end to end.
- **[investigating-design-rationale](./skills/engineering/investigating-design-rationale/SKILL.md)**: Investigate the design rationale behind code.
- **[landing-prs](./skills/engineering/landing-prs/SKILL.md)**: Land a reviewed pull request.
- **[merging-dependabot-prs](./skills/engineering/merging-dependabot-prs/SKILL.md)**: Review and merge safe Dependabot updates. Explicit invocation only.
- **[proving-claims](./skills/engineering/proving-claims/SKILL.md)**: Prove claims or a PR test plan with evidence. Calls: `capturing-screenshots`, `explaining-architecture`, `investigating-design-rationale`.
- **[rebasing-branches](./skills/engineering/rebasing-branches/SKILL.md)**: Rebase a branch onto its base. Explicit invocation only.
- **[rebasing-dependabot-prs](./skills/engineering/rebasing-dependabot-prs/SKILL.md)**: Rebase selected Dependabot pull requests. Explicit invocation only.
- **[rebasing-open-prs](./skills/engineering/rebasing-open-prs/SKILL.md)**: Rebase all open pull requests. Explicit invocation only.
- **[removing-comments](./skills/engineering/removing-comments/SKILL.md)**: Remove low-value source comments. Explicit invocation only.
- **[reviewing-code](./skills/engineering/reviewing-code/SKILL.md)**: Review a diff with fresh-context discipline.
- **[reviewing-design-docs](./skills/engineering/reviewing-design-docs/SKILL.md)**: Adversarially review a design document.
- **[reviewing-rails-code](./skills/engineering/reviewing-rails-code/SKILL.md)**: Review Rails code for unnecessary complexity.
- **[reviewing-ruby-code](./skills/engineering/reviewing-ruby-code/SKILL.md)**: Review Ruby code for unnecessary complexity.
- **[simplifying-ruby-code](./skills/engineering/simplifying-ruby-code/SKILL.md)**: Simplify overengineered Ruby code.
- **[using-dev-cli](./skills/engineering/using-dev-cli/SKILL.md)**: Set up and use the dev CLI.
- **[using-gh-cli](./skills/engineering/using-gh-cli/SKILL.md)**: Work with GitHub through gh.
- **[using-jq](./skills/engineering/using-jq/SKILL.md)**: Transform JSON with jq.
- **[watching-authored-prs](./skills/engineering/watching-authored-prs/SKILL.md)**: Watch your own PR for review feedback and CI. Calls: `addressing-pr-comments`.
- **[watching-reviewed-prs](./skills/engineering/watching-reviewed-prs/SKILL.md)**: Watch a PR you review, then approve once. Explicit invocation only.

### Productivity

- **[being-extremely-fucking-brief](./skills/productivity/being-extremely-fucking-brief/SKILL.md)**: Keep responses extremely brief.
- **[composing-agent-prompts](./skills/productivity/composing-agent-prompts/SKILL.md)**: Compose an agent-optimized prompt for a task.
- **[cutting-skills](./skills/productivity/cutting-skills/SKILL.md)**: Trim an agent skill to its necessary instructions.
- **[improving-prompts](./skills/productivity/improving-prompts/SKILL.md)**: Improve an existing prompt.
- **[learning-from-mistakes](./skills/productivity/learning-from-mistakes/SKILL.md)**: Record a correction for future sessions.
- **[redoing-implementations](./skills/productivity/redoing-implementations/SKILL.md)**: Redo work using the current findings. Explicit invocation only.
- **[running-retros](./skills/productivity/running-retros/SKILL.md)**: Mine a session or named sources for durable learnings. Explicit invocation only.
- **[writing-prose](./skills/productivity/writing-prose/SKILL.md)**: Write concise prose for people.
- **[writing-system-prompts](./skills/productivity/writing-system-prompts/SKILL.md)**: Write or review system prompts.

<!-- generated:end -->

## Docs

Browse the [skill catalog](https://skills.bostonaholic.dev) for usage and installation instructions.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. See [README and site maintenance](docs/catalog.md) for documentation changes and [versioning and releases](docs/versioning.md) for publishing.

## License

MIT. See [LICENSE](LICENSE).

## Deprecated

Retired skills are preserved in [skills/deprecated](skills/deprecated/README.md) and excluded from installation.
