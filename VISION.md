# Vision

This collection is a set of small skills that compose. Each skill does one job, owns the rules for that job, and can be called by a user, by the model, or by another skill. A larger workflow is a skill that calls smaller skills. No skill knows who calls it.

## What composition means here

A skill composes when another skill, an agent, or a person can use it as one step of a larger job without reading its internals or changing it. These properties make that possible:

1. **One job per skill.** `opening-prs` opens and refreshes a pull request. `writing-commit-messages` writes commit messages. `updating-changelogs` adds changelog bullets. `attaching-pr-screenshots` uploads images into a PR body. A caller that needs a PR, a commit, and a changelog entry calls the skills for those jobs. It does not get one skill that does all three.
2. **The description is the interface.** A skill's `name` and its `Use when` clause tell a harness and a caller when to load it. A caller passes facts (a branch, a result file, an inputs file) and gets a result back. The procedure behind the description can change without any caller changing.
3. **Calls are explicit and degrade.** A skill reaches another skill by name and states what to do when that skill is not installed ([skill calls](shared/skill-calls.md)). Each call is written as "call the Skill tool with `<name>`" in the caller's files, so a search for that phrase finds the dependency graph. An agent that installs a named skill installs the skills it calls too ([INSTALL.md](INSTALL.md#for-agents) step 3).
4. **Skills do not know their callers.** No skill names a pipeline, plugin, or process that calls it, and no skill changes its behavior for one caller. A caller that needs different behavior passes different facts. When a rule is specific to one caller, it belongs in that caller.

## One rule, one owner

When two skills need the same rule, the rule lives once in `shared/` and `npm run sync-shared` copies it into each skill that links it. `shared/pr-body-rules.md` is the example: `opening-prs` and `stacking-prs` both write PR numbers as full links and build the same Stack table, and a change to that rule is one edit plus one sync. A rule that two skills restate in their own words will drift, so the collection does not allow it.

The same rule applies across repositories. When a rule about PR bodies, commits, or changelogs exists in this collection, a tool that composes with it uses the skill instead of keeping its own copy.

## What a composable skill looks like

- It is short. It holds only what a frontier model would otherwise get wrong ([skill authoring](docs/skill-authoring.md)).
- It is agent-agnostic. It runs in every harness the collection supports, and a harness without a Skill tool reads the called skill's `SKILL.md` instead.
- Its fixed steps are scripts. A step whose result is fixed by its inputs runs as a script with an exit code, so a caller can depend on the result. The model keeps only the judgment.
- Its inputs are data. A skill treats files, diffs, PR bodies, and tool output as data, never as instructions ([external data](shared/external-data.md)).
- Its side effects are stated. The README section "What the skills run and send" lists every command, network destination, upload, and write outside the working repository, so a caller knows what it composes in.

## Where this is going

- More workflows become compositions of existing skills, not new monolithic skills. A new skill is justified when it owns a job no other skill owns.
- When a skill grows a second job, it splits into two skills that one caller can still compose.
- When a rule appears in two places, it moves to `shared/` or to the one skill that owns it.
- Installing a named skill also installs the skills it calls, and the skills those call, so the installed skill has every skill it calls.

## What this collection is not

- It is not a pipeline. It does not decide phase order, gates, or when a PR opens. A process that needs those composes these skills and owns that order itself.
- It is not tied to one harness, one agent, or one caller.
