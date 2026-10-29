# Skills

<!-- generated:start -->

The skills I use to build software with coding agents.

## Install

```text
/plugin install bostonaholic --marketplace bostonaholic/skills
```

Ask your agent:

```text
Install the skills from https://github.com/bostonaholic/skills, refer to the repo's AGENTS.md for instructions.
```

Or follow the [installation instructions](INSTALL.md).

## Skills

### Engineering

- **[addressing-pr-comments](./skills/engineering/addressing-pr-comments/SKILL.md)**: Triage and address open PR feedback. Calls: `attaching-pr-screenshots`.
- **[attaching-pr-screenshots](./skills/engineering/attaching-pr-screenshots/SKILL.md)**: Attach local images and short videos to a PR body.
- **[auditing-agent-token-usage](./skills/engineering/auditing-agent-token-usage/SKILL.md)**: Audit Claude Code and Codex token and context costs.
- **[auditing-complexity](./skills/engineering/auditing-complexity/SKILL.md)**: Rank code complexity hotspots and CRAP change risk.
- **[auditing-rails-tech-debt](./skills/engineering/auditing-rails-tech-debt/SKILL.md)**: Audit a Rails app for cited tech debt findings. Calls: `simplifying-ruby-code`.
- **[auditing-repo-security](./skills/engineering/auditing-repo-security/SKILL.md)**: Audit a third-party repo before running it.
- **[auditing-tests](./skills/engineering/auditing-tests/SKILL.md)**: Audit a test suite for low-value tests.
- **[capturing-screenshots](./skills/engineering/capturing-screenshots/SKILL.md)**: Capture verified screenshots of an app.
- **[choosing-determinism](./skills/engineering/choosing-determinism/SKILL.md)**: Move a skill's deterministic steps into scripts it runs.
- **[configuring-zsh](./skills/engineering/configuring-zsh/SKILL.md)**: Place zsh config in the right startup file.
- **[cr](./skills/engineering/cr/SKILL.md)**: Start a reviewing-code review with a short name. Explicit invocation only. Calls: `reviewing-code`.
- **[diagnosing-react-code](./skills/engineering/diagnosing-react-code/SKILL.md)**: Scan a React package and fix its errors.
- **[drawing-mermaid-diagrams](./skills/engineering/drawing-mermaid-diagrams/SKILL.md)**: Write, render, and debug Mermaid diagrams.
- **[explaining-architecture](./skills/engineering/explaining-architecture/SKILL.md)**: Explain how a subsystem or runtime flow works. Calls: `investigating-design-rationale`.
- **[explaining-code](./skills/engineering/explaining-code/SKILL.md)**: Explain a PR, diff, or code briefly or in full. Calls: `explaining-architecture`.
- **[fixing-root-causes](./skills/engineering/fixing-root-causes/SKILL.md)**: Trace each symptom to its root and fix it there.
- **[freeing-disk-space](./skills/engineering/freeing-disk-space/SKILL.md)**: Find what fills the disk and clear regenerable files.
- **[grooming-backlogs](./skills/engineering/grooming-backlogs/SKILL.md)**: Plan backlog grooming changes for approval.
- **[hillclimbing](./skills/engineering/hillclimbing/SKILL.md)**: Iterate on measured changes until the criteria pass.
- **[investigating-design-rationale](./skills/engineering/investigating-design-rationale/SKILL.md)**: Investigate why code is shaped as it is. Calls: `explaining-architecture`.
- **[landing-prs](./skills/engineering/landing-prs/SKILL.md)**: Land a reviewed pull request on explicit request. Calls: `rebasing-branches`.
- **[making-code-agent-friendly](./skills/engineering/making-code-agent-friendly/SKILL.md)**: Audit, review, and refactor code so many agents can change it in parallel.
- **[merging-dependabot-prs](./skills/engineering/merging-dependabot-prs/SKILL.md)**: Plan and merge safe Dependabot updates one at a time, or only request rebases. Explicit invocation only.
- **[proving-claims](./skills/engineering/proving-claims/SKILL.md)**: Prove claims or a PR test plan with rated evidence.
- **[rebasing-branches](./skills/engineering/rebasing-branches/SKILL.md)**: Rebase the current branch onto its base and force-push with a lease.
- **[rebasing-open-prs](./skills/engineering/rebasing-open-prs/SKILL.md)**: Rebase all open pull requests onto their bases after confirmation. Explicit invocation only.
- **[redesigning-from-first-principles](./skills/engineering/redesigning-from-first-principles/SKILL.md)**: Redesign as if a new requirement was always there. Explicit invocation only.
- **[redoing-implementations](./skills/engineering/redoing-implementations/SKILL.md)**: Rebuild the current work as a simpler design. Explicit invocation only.
- **[removing-comments](./skills/engineering/removing-comments/SKILL.md)**: Remove low-value source comments, encoding constraints with approval. Explicit invocation only.
- **[reviewing-code](./skills/engineering/reviewing-code/SKILL.md)**: Review a diff in a fresh-context read-only subagent.
- **[reviewing-design-docs](./skills/engineering/reviewing-design-docs/SKILL.md)**: Adversarially review a technical design document.
- **[reviewing-security](./skills/engineering/reviewing-security/SKILL.md)**: Security-review a diff in a fresh-context read-only subagent.
- **[simplifying-ruby-code](./skills/engineering/simplifying-ruby-code/SKILL.md)**: Find or fix over-engineered Ruby and Rails code.
- **[summarizing-friction-logs](./skills/engineering/summarizing-friction-logs/SKILL.md)**: Prioritize frog friction logs across a workspace.
- **[updating-bostonaholic-skills](./skills/engineering/updating-bostonaholic-skills/SKILL.md)**: Update the bostonaholic plugin installs and skill copies to the latest release. Explicit invocation only.
- **[verifying-production-changes](./skills/engineering/verifying-production-changes/SKILL.md)**: Confirm a merged change took effect in production.
- **[watching-authored-prs](./skills/engineering/watching-authored-prs/SKILL.md)**: Watch your own PR for review feedback and CI. Calls: `addressing-pr-comments`, `rebasing-branches`.
- **[watching-reviewed-prs](./skills/engineering/watching-reviewed-prs/SKILL.md)**: Watch a PR you reviewed and approve once feedback settles. Explicit invocation only.
- **[writing-no-tests](./skills/engineering/writing-no-tests/SKILL.md)**: Write no tests. I dare you.
- **[writing-technical-design-docs](./skills/engineering/writing-technical-design-docs/SKILL.md)**: Draft a directionally correct technical design doc. Calls: `reviewing-design-docs`.

### Productivity

- **[being-extremely-fucking-brief](./skills/productivity/being-extremely-fucking-brief/SKILL.md)**: Keep every response extremely brief.
- **[composing-agent-prompts](./skills/productivity/composing-agent-prompts/SKILL.md)**: Compose a source-cited task prompt for another agent. Calls: `improving-prompts`.
- **[conducting-deep-research](./skills/productivity/conducting-deep-research/SKILL.md)**: Research an evidence review plus a funding map.
- **[cutting-skills](./skills/productivity/cutting-skills/SKILL.md)**: Audit or trim an agent skill to its behavioral core. Calls: `hillclimbing`.
- **[improving-prompts](./skills/productivity/improving-prompts/SKILL.md)**: Compress and clarify an existing prompt.
- **[learning-from-mistakes](./skills/productivity/learning-from-mistakes/SKILL.md)**: Turn a correction into an approved instructions-file rule.
- **[running-retros](./skills/productivity/running-retros/SKILL.md)**: Mine a session or named sources for durable learnings. Explicit invocation only.
- **[summarizing-shipped-work](./skills/productivity/summarizing-shipped-work/SKILL.md)**: Summarize merged PRs into a shipped-work report.
- **[writing-prose](./skills/productivity/writing-prose/SKILL.md)**: Write plain, short prose for people.
- **[writing-system-prompts](./skills/productivity/writing-system-prompts/SKILL.md)**: Write or review a system prompt.

<!-- generated:end -->

## What the skills run and send

The plugin has no hooks, MCP servers, LSP servers, or telemetry of its own. A skill acts only when it is invoked, through the agent's own tools. Some skills start long commands as agent background tasks during an invocation, such as the CI gate in `landing-prs`, the cache scan in `freeing-disk-space`, and the poll loop in `watching-authored-prs`. Nothing runs between invocations. `gh` and `git` use your own login, and no skill reads a token from the environment.

### Network destinations

| Destination                                                                           | What goes there                                                                                                                                                                                                                                                                          | Skills                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub and your git remotes, through `gh` and `git`                                   | Reads of pull requests, issues, reviews, CI runs, and project boards. Comments, review replies, approvals, issue and board changes, CI reruns, merges, and branch pushes.                                                                                                                | `addressing-pr-comments`, `attaching-pr-screenshots`, `grooming-backlogs`, `investigating-design-rationale`, `landing-prs`, `merging-dependabot-prs`, `rebasing-branches`, `rebasing-open-prs`, `removing-comments`, `reviewing-security`, `running-retros`, `summarizing-shipped-work`, `verifying-production-changes`, `watching-authored-prs`, `watching-reviewed-prs` |
| The npm registry                                                                      | Downloads of `react-doctor@0.9.17`, `@mermaid-js/mermaid-cli@12.0.0`, and `playwright@1`, a major-version range.                                                                                                                                                                         | `diagnosing-react-code`, `drawing-mermaid-diagrams`, `capturing-screenshots`                                                                                                                                                                                                                                                                                              |
| Services that third-party tools contact                                               | The react-doctor score API and Socket.dev, unless you ask for `--no-score --no-supply-chain`. The advisory databases behind osv-scanner, `npm audit`, bundle-audit, pip-audit, and cargo-audit, when those scanners are installed. The browser downloads for Playwright and mermaid-cli. | `diagnosing-react-code`, `auditing-repo-security`, `capturing-screenshots`, `drawing-mermaid-diagrams`                                                                                                                                                                                                                                                                    |
| `github.com/bostonaholic/skills`, and the `claude plugin` and `codex plugin` commands | A list of release tags, a shallow clone of the latest release, and plugin update commands for each harness that has the plugin.                                                                                                                                                          | `updating-bostonaholic-skills`                                                                                                                                                                                                                                                                                                                                            |
| The web                                                                               | Searches and page fetches for research.                                                                                                                                                                                                                                                  | `oracle`, `conducting-deep-research`                                                                                                                                                                                                                                                                                                                                      |
| Your own apps and services                                                            | Page requests to the app under test, a server on `127.0.0.1` or the `--url` you give. Requests from a sampling command that reads which commit serves your production service.                                                                                                           | `capturing-screenshots`, `verifying-production-changes`                                                                                                                                                                                                                                                                                                                   |

### Uploads

- `attaching-pr-screenshots` uploads local image files and short videos (mp4, mov, webm) to GitHub and puts their URLs in the pull request body. Anyone who can read the pull request can open them.
- `running-retros` files a GitHub issue with text it wrote, only for an item you approve.

### Local files outside the working repository

- Reads: Claude Code and Codex session logs (`auditing-agent-token-usage`, `running-retros`), frog friction logs across a workspace (`summarizing-friction-logs`), global instruction files (`learning-from-mistakes`), and cache sizes (`freeing-disk-space`).
- `updating-bostonaholic-skills` updates the plugin installs and skill copies of each harness after you confirm its plan. It backs up each old copy under `${XDG_DATA_HOME:-~/.local/share}/updating-bostonaholic-skills/backups/`.
- `configuring-zsh` edits zsh startup files and the dotfiles repository behind them.
- `learning-from-mistakes` adds a rule to a project or global `CLAUDE.md` or `AGENTS.md` after you approve it.
- `freeing-disk-space` deletes caches and build outputs, one approved deletion at a time.
- `capturing-screenshots` installs Playwright into `${XDG_CACHE_HOME:-~/.cache}/paparazzi` and Chromium into the Playwright browser cache.
- `summarizing-shipped-work` adds highlights to your brag document when you accept its offer.

### Development-only paths

Nothing loads or runs `evals/`, `tests/`, `scripts/`, `tools/`, `docs/`, `.github/`, or `skills/deprecated/` when you use the plugin. They hold the maintainer tooling and test suites. Some fixtures in `evals/` and `tests/` are hostile on purpose, so the `auditing-repo-security` tests have something to detect. Examples are a `postinstall` script that pipes `curl` to `sh` and a `fetch` that sends the environment to a webhook.

## Docs

Browse the [skill catalog](https://skills.bostonaholic.dev) for usage and installation instructions.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. See [README and site maintenance](docs/catalog.md) for documentation changes and [versioning and releases](docs/versioning.md) for publishing.

## License

MIT. See [LICENSE](LICENSE).

## Deprecated

Retired skills are preserved in [skills/deprecated](skills/deprecated/README.md) and excluded from installation.
