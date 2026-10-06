# Installing

Two ways in. The Claude Code plugin installs every skill as one managed bundle that updates when a new version ships. `npx skills` copies the skills you pick into your project or home directory, for Claude Code, Codex, and other agents; you own and edit the copies. Pick one: installing both gives you every skill twice.

## Claude Code

```sh
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic@skills
```

Update the marketplace first, then the plugin:

```sh
claude plugin marketplace update skills
claude plugin update bostonaholic@skills
```

## Any agent, whole set

```sh
npx skills@latest add bostonaholic/skills
```

Pick the skills you want, and which agents to install them on.

## One skill

```sh
npx skills@latest add bostonaholic/skills --skill <name>
```

To update it:

```sh
npx skills@latest update <name>
```

A skill that calls another skill names it, and stops or falls back when that skill is missing.

## For agents

An agent installing on a user's behalf:

1. In Claude Code, run the two Claude Code commands above.
2. Elsewhere, install without prompts: `npx skills@latest add bostonaholic/skills --skill '*' --agent <agent> --yes`. Pass `--agent '*'` to install on every agent. Add `--global` for a user-level install; ask the user which scope they want if they did not say.
3. Install only the plugin or only the `npx skills` copies, never both. The subagents in `agents/` come only with the plugin.
4. Confirm the install: `claude plugin list` shows `bostonaholic@skills`, or `npx skills@latest list` shows the skills.
5. Tell the user to restart the agent so it loads the new skills.
