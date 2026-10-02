# Skills

<!-- generated:start -->

The skills I use to build software with coding agents.

## Install

Two ways in. The Claude Code plugin installs every skill as one managed bundle that updates when a new version ships. `npx skills` copies the skills you pick into your project or home directory, for Claude Code, Codex, and other agents; you own and edit the copies. Pick one: installing both gives you every skill twice.

### Claude Code

```sh
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic-skills@bostonaholic
```

Update the marketplace first, then the plugin:

```sh
claude plugin marketplace update bostonaholic
claude plugin update bostonaholic-skills@bostonaholic
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

- **[audit-complexity](./skills/engineering/audit-complexity/SKILL.md)**: Rank where code complexity concentrates in a codebase.
- **[audit-tests](./skills/engineering/audit-tests/SKILL.md)**: Audit a test suite for low-value tests.
- **[code-review](./skills/engineering/code-review/SKILL.md)**: Review a diff with fresh-context discipline.
- **[dev-cli](./skills/engineering/dev-cli/SKILL.md)**: Set up and use the dev CLI.
- **[eng-design-doc-review](./skills/engineering/eng-design-doc-review/SKILL.md)**: Adversarially review a design document.
- **[gh-cli](./skills/engineering/gh-cli/SKILL.md)**: Work with GitHub through gh.
- **[groom-backlog](./skills/engineering/groom-backlog/SKILL.md)**: Groom a project backlog end to end.
- **[how](./skills/engineering/how/SKILL.md)**: Explain how a subsystem works. Calls: `why`.
- **[jq](./skills/engineering/jq/SKILL.md)**: Transform JSON with jq.
- **[mermaid](./skills/engineering/mermaid/SKILL.md)**: Create and review Mermaid diagrams.
- **[no-comments](./skills/engineering/no-comments/SKILL.md)**: Remove low-value source comments. Explicit invocation only.
- **[oss-security-analysis](./skills/engineering/oss-security-analysis/SKILL.md)**: Audit a repository for security risks.
- **[paparazzi](./skills/engineering/paparazzi/SKILL.md)**: Capture verified screenshots of an app.
- **[pr-open-comments](./skills/engineering/pr-open-comments/SKILL.md)**: Triage unresolved PR review comments. Calls: `pr-screenshots`.
- **[pr-rebase](./skills/engineering/pr-rebase/SKILL.md)**: Rebase a branch onto its base. Explicit invocation only.
- **[pr-screenshots](./skills/engineering/pr-screenshots/SKILL.md)**: Attach local images to a PR body.
- **[pr-watch-as-author](./skills/engineering/pr-watch-as-author/SKILL.md)**: Watch your own PR for review feedback and CI. Calls: `pr-open-comments`.
- **[pr-watch-as-reviewer](./skills/engineering/pr-watch-as-reviewer/SKILL.md)**: Watch a PR you review, then approve once. Explicit invocation only.
- **[prove](./skills/engineering/prove/SKILL.md)**: Prove claims or a PR test plan with evidence. Calls: `how`, `paparazzi`, `why`.
- **[react-doctor](./skills/engineering/react-doctor/SKILL.md)**: Diagnose React codebase issues.
- **[rebase-dependabots](./skills/engineering/rebase-dependabots/SKILL.md)**: Rebase selected Dependabot pull requests. Explicit invocation only.
- **[rebase-open-prs](./skills/engineering/rebase-open-prs/SKILL.md)**: Rebase all open pull requests. Explicit invocation only.
- **[review-rails](./skills/engineering/review-rails/SKILL.md)**: Review Rails code for unnecessary complexity.
- **[review-ruby](./skills/engineering/review-ruby/SKILL.md)**: Review Ruby code for unnecessary complexity.
- **[safely-merge-dependabots](./skills/engineering/safely-merge-dependabots/SKILL.md)**: Review and merge safe Dependabot updates. Explicit invocation only.
- **[shipit](./skills/engineering/shipit/SKILL.md)**: Land a reviewed pull request.
- **[simplifying-ruby-code](./skills/engineering/simplifying-ruby-code/SKILL.md)**: Simplify overengineered Ruby code.
- **[why](./skills/engineering/why/SKILL.md)**: Investigate the design rationale behind code.
- **[zsh-config](./skills/engineering/zsh-config/SKILL.md)**: Edit zsh configuration in dotfiles.

### Productivity

- **[agent-prompt](./skills/productivity/agent-prompt/SKILL.md)**: Compose an agent-optimized prompt for a task.
- **[be-extremely-fucking-brief](./skills/productivity/be-extremely-fucking-brief/SKILL.md)**: Keep responses extremely brief.
- **[improve-prompt](./skills/productivity/improve-prompt/SKILL.md)**: Improve an existing prompt.
- **[learn](./skills/productivity/learn/SKILL.md)**: Record a correction for future sessions.
- **[redo](./skills/productivity/redo/SKILL.md)**: Redo work using the current findings. Explicit invocation only.
- **[retro](./skills/productivity/retro/SKILL.md)**: Mine this session for durable learnings. Explicit invocation only.
- **[skill-cutter](./skills/productivity/skill-cutter/SKILL.md)**: Trim an agent skill to its necessary instructions.
- **[system-prompt](./skills/productivity/system-prompt/SKILL.md)**: Write or review system prompts.
- **[writing-prose](./skills/productivity/writing-prose/SKILL.md)**: Write concise prose for people.

<!-- generated:end -->

## Docs

Browse the [skill catalog](https://skills.bostonaholic.dev) for usage and installation instructions.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. See [README and site maintenance](docs/catalog.md) for documentation changes and [versioning and releases](docs/versioning.md) for publishing.

## License

MIT. See [LICENSE](LICENSE).

## Deprecated

Retired skills are preserved in [skills/deprecated](skills/deprecated/README.md) and excluded from installation.
