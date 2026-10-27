# Installing

The Claude Code and Cursor plugins install every skill as one bundle that you update in one step. `npx skills` copies the skills you pick into your project or home directory, for Claude Code, Codex, Cursor, and other agents; you own and edit the copies. Grok Bot gets its own copy script below. Pick one per agent: installing two ways on one agent gives it every skill twice.

To update every install on a machine at once, run the `updating-bostonaholic-skills` skill. It plans first and changes only installs that exist: the Claude Code and Codex plugins, the Cursor plugin clone (a fast-forward pull of the clone's own branch), and each skill already present in the Antigravity (`~/.gemini/antigravity-cli/skills`), OpenCode, Cursor (`~/.cursor/skills`), and Grok Bot (`~/agent-data/workflows`) skill directories, whatever installed it. It backs up every copy it replaces. It does not touch `~/.claude/skills`, `~/.agents/skills`, or project-level `npx skills` installs; use `npx skills@latest update` for those.

## Claude Code

In a Claude Code 2.1.275 or later session, install in one step:

```text
/plugin install bostonaholic --marketplace bostonaholic/skills
```

From a terminal, or in an older Claude Code, add the marketplace, then install the plugin:

```sh
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic@skills
```

Update the marketplace first, then the plugin:

```sh
claude plugin marketplace update skills
claude plugin update bostonaholic@skills
```

## Cursor

```sh
git clone https://github.com/bostonaholic/skills ~/.cursor/plugins/local/bostonaholic
```

Then run `Developer: Reload Window`. To update:

```sh
git -C ~/.cursor/plugins/local/bostonaholic pull
```

Teams can instead import this repository as a team marketplace from the Cursor dashboard.

## Grok Bot

Grok Bot uses the same plugins as Cursor, and a plugin installed on the account reaches every bot on it. On a Cursor team whose admin has imported this repository as a team marketplace, try that first: open **Plugins** in the Grok Bot sidebar, add `bostonaholic`, and confirm under **Settings** > **Plugins** that its skills show. Nothing is copied, and the plugin updates on its own. This path is unverified: Grok Bot's docs do not say that a plugin's skills reach the bot's skill library.

Otherwise, or when the plugin's skills do not show, copy the skills into the bot's own skill library. Run this on the bot's computer:

```sh
git clone https://github.com/bostonaholic/skills ~/bostonaholic-skills
sh ~/bostonaholic-skills/scripts/install-grok-bot.sh
```

The script copies each active skill (its `SKILL.md`, `references/`, `scripts/`, and `shared/`) to `~/agent-data/workflows/<name>/`, the library every bot on the account reads. Archived skills under `skills/deprecated/` are skipped. Rerunning replaces each copy in place, so this updates:

```sh
git -C ~/bostonaholic-skills pull
sh ~/bostonaholic-skills/scripts/install-grok-bot.sh
```

A bot that plans, writes, and researches rather than codes needs only the strategy set: `being-extremely-fucking-brief`, `composing-agent-prompts`, `conducting-deep-research`, `grooming-backlogs`, `improving-prompts`, `pricing-creativity`, `writing-prose`, and `writing-system-prompts`. Install only those with `--set strategy`:

```sh
sh ~/bostonaholic-skills/scripts/install-grok-bot.sh --set strategy
```

Pass `--dest <dir>` when the library lives elsewhere. Confirm the install under **Settings** > **Plugins** > **Yours**, where each skill appears in the bot's skill catalog, and in the `/` menu of a conversation.

Grok Bot has no Skill tool. A skill that calls another skill reads that skill's `SKILL.md` from the library instead, as its shared skill call rules say, so install a caller together with the skills it calls.

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

1. In Claude Code, run the `claude plugin` install commands in the `sh` block above. In Cursor, run the Cursor clone command above. In Grok Bot, run the Grok Bot install commands above on the bot's computer, adding `--set strategy` when the bot does not write code; add the plugin instead only when the account's team marketplace offers it.
2. Elsewhere, install without prompts: `npx skills@latest add bostonaholic/skills --skill '*' --agent <agent> --yes`. Pass `--agent '*'` to install on every agent. Add `--global` for a user-level install; ask the user which scope they want if they did not say.
3. Install one way per agent, never two. The subagents in `agents/` and the `/cr` command come with the Claude Code and Cursor plugins.
4. Confirm the install: `claude plugin list` shows `bostonaholic@skills`, `~/.cursor/plugins/local/bostonaholic/.cursor-plugin/plugin.json` exists, `ls ~/agent-data/workflows` lists the skills on a Grok Bot computer, or `npx skills@latest list` shows the skills.
5. Tell the user to restart the agent so it loads the new skills.
