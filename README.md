# Skills

skills that pay the bills

<!-- generated:start -->

Agent skills for pull requests, code and design review, codebase audits, and investigation. Each skill installs on its own.

These skills were extracted from the Team plugin. They do not need Team, and Team does not need them.

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

### User-invoked

- **[no-comments](./skills/no-comments/SKILL.md)**: Remove low-value source comments.
- **[pr-rebase](./skills/pr-rebase/SKILL.md)**: Rebase a branch onto its base.
- **[pr-watch-as-reviewer](./skills/pr-watch-as-reviewer/SKILL.md)**: Watch a PR you review, then approve once.
- **[retro](./skills/retro/SKILL.md)**: Mine this session for durable learnings.

### Model-invoked

- **[agent-prompt](./skills/agent-prompt/SKILL.md)**: Compose an agent-optimized prompt for a task.
- **[audit-complexity](./skills/audit-complexity/SKILL.md)**: Rank where code complexity concentrates in a codebase.
- **[audit-tests](./skills/audit-tests/SKILL.md)**: Audit a test suite for low-value tests.
- **[code-review](./skills/code-review/SKILL.md)**: Review a diff with fresh-context discipline.
- **[eng-design-doc-review](./skills/eng-design-doc-review/SKILL.md)**: Adversarially review a design document.
- **[groom-backlog](./skills/groom-backlog/SKILL.md)**: Groom a project backlog end to end.
- **[how](./skills/how/SKILL.md)**: Explain how a subsystem works. Calls: `why`.
- **[paparazzi](./skills/paparazzi/SKILL.md)**: Capture verified screenshots of an app.
- **[pr-cleanup](./skills/pr-cleanup/SKILL.md)**: Tear down branch state after a PR.
- **[pr-open-comments](./skills/pr-open-comments/SKILL.md)**: Triage unresolved PR review comments. Calls: `pr-screenshots`.
- **[pr-screenshots](./skills/pr-screenshots/SKILL.md)**: Attach local images to a PR body.
- **[pr-watch-as-author](./skills/pr-watch-as-author/SKILL.md)**: Watch your own PR for review feedback. Calls: `pr-open-comments`.
- **[prove](./skills/prove/SKILL.md)**: Prove claims or a PR test plan with evidence. Calls: `how`, `paparazzi`, `why`.
- **[shipit](./skills/shipit/SKILL.md)**: Land a reviewed pull request. Calls: `pr-cleanup`.
- **[why](./skills/why/SKILL.md)**: Investigate the design rationale behind code.

<!-- generated:end -->

## Docs

Every skill, with its usage and install command: https://skills.bostonaholic.dev

## Contributing

Read [AGENTS.md](AGENTS.md) before changing a skill.

## License

MIT. See [LICENSE](LICENSE).
