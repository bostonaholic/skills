---
name: mechanizing-instruction-rules
description: Moves every rule in an agent instruction file (AGENTS.md, CLAUDE.md, or similar) or a Claude Code memory file that a command can check into a hook, a lint rule, or a test, then deletes it from the instruction file or marks the memory `enforced-by:`, leaving only the rules that need judgment. Use when the user asks to enforce instruction-file or memory rules mechanically, to audit which rules have no check, or to trim an instruction file down to judgment calls.
disable-model-invocation: true
metadata:
  internal: true
---

# Mechanizing instruction rules

## Scope

- The user names the file. With none named, use the repository's root agent instruction file. Resolve symlinks first: `CLAUDE.md` is often a link to `AGENTS.md`, so edit the target.
- Memory rules: the Claude Code memory files in `~/.claude/projects/*/memory/*.md`, except `MEMORY.md` and memories of type `user` or `reference`. They are in scope with every run. Their checks live in the repository that holds the global agent config, such as a dotfiles repository, or in the repository the memory's project directory names.
- An audit, when the user asks only which rules lack a check, runs steps 1 to 3 and 5, then reports. It proposes checks and changes nothing.
- A rule is any sentence that says what a change must or must not do. Prose that maps the repository, explains a skill, or declares a procedure other tools read (a pre-merge step, a release command) is not a rule. Keep it.

## Steps

1. **List the rules.** Run `node scripts/list-rules.mjs <repo>`. It prints each instruction-file rule sentence and each memory rule, with `status`: `enforced` (its `enforced-by:` path exists), `stale` (that path is gone; treat as uncovered and say so), `check-found` (a deny rule, hook, workflow, script, or test quotes one of its code spans), or `uncovered`. `check-found` is a lead, not evidence: step 2 confirms it. The list is a candidate set: drop sentences that are not rules.
2. **Split into clauses.** Many rules mix a checkable clause with a judgment clause. Classify each clause, not each rule.
3. **Classify each clause** as one of these, with evidence:
   - Enforced: name the command and the line that fails when the clause breaks. A doc or test header that claims a check is not evidence. Open the check and confirm it runs.
   - Checkable: a script could decide it from the tree, the diff, or the hosting platform's API, with no false positives on the current tree.
   - Judgment: deciding it needs reading intent or prose.
4. **Check the history before adding a check.** Search for a check that was removed on purpose (`git log -S'<pattern>'`, and the commit messages that mention the rule). Also read the file's own rules about what checks may do, such as "lint checks structure, never prose". A deliberate removal or such a rule wins: keep the clause as judgment and say why.
5. **Pick the mechanism** for each checkable clause:
   - A test or lint rule in the existing commands, for anything readable from the tree. It binds every agent and every person, so prefer it.
   - A CI workflow, for platform state such as commit signatures or PR metadata.
   - An agent hook, such as a Claude Code `PreToolUse` hook in `.claude/settings.json`, to stop an edit before it happens, for example to generated files. A hook binds one harness only. Add it on top of a test, not instead of one, when other agents read the file.
   - For a memory rule, which binds Claude Code only, take the highest that fits: a `permissions.deny` rule in the settings file, then a `PreToolUse` hook, then a CI check, then a lint rule. Name the exact file path the check goes in. With none that fits, say why and leave the rule as prose.
   - Follow the repository's own rules for tests and lint: where checks live, what gets a test, how a failure prints.
6. **Make each failure name its fix.** Once the rule leaves the file, the failure message is the only place an agent learns what to do. "README is stale. Run npm run readme." beats a bare diff.
7. **Prove each new check**: it passes on the current tree, and it fails on a fixture or scratch edit that breaks the clause. Remove the scratch edit.
8. **Delete the enforced and newly checked clauses** from the instruction file. Rewrite the surviving rules as judgment only, and replace per-rule "checked by" notes with one line naming where the checks live. Keep a memory rule instead and run `node scripts/mark-enforced.mjs <memory.md> <absolute check path>`: it writes `enforced-by:` into the frontmatter and refuses (exit 1) when the check path does not exist, so mark a memory only after its check is on disk.
9. **Fix references.** Rules get renumbered or removed: search scripts, tests, workflows, and docs for `rule N`, the section anchor, and quoted rule text, and update them. Messages that cite a rule number should state the rule instead.
10. **Run every check the change touched**, plus the repository's verification commands.

## Report

- One row per clause or memory rule: moved (with the check that now enforces it), already enforced (with that check), or kept as judgment (with the reason, including any deliberate removal from step 4). Each uncovered row in an audit names one proposed check and the file path to create.
- The commands run and their results, with failures that also fail on the base branch marked as such.
