---
name: rebasing-branches
description: Rebases the current branch onto its PR or default base, resolves conflicts by intent, re-runs the project's checks, and force-pushes with an explicit lease. Use when the user says "rebase this branch", or when the user explicitly asks to rebase the current branch, or when landing-prs or watching-authored-prs calls it on a conflict. Never infer from a behind branch alone. Not for rebasing every open PR; use rebasing-open-prs.
effort: high
argument-hint: "[<pr-number-or-url>]"
---

# Rebasing Branches

Rebase the current branch onto the latest base, resolve conflicts from both
sides' intent, and confirm the branch still works before publishing it.

- The explicit invocation, a call from `landing-prs` whose land request covers
  it, or a call from `watching-authored-prs` on the user's own conflicting PR
  authorizes the history rewrite and the force-push; do not stop to confirm
  them.
- This skill does not wait for CI and does not merge.

The scripts live in `<skill-dir>/scripts/` and run from inside the
repository. Each documents its usage, output, and exit codes in its header.
They need `git` and `gh`; check with `command -v git gh`.

## Prepare

Run `"<skill-dir>/scripts/prepare-rebase.sh" [<pr-number-or-url>]`, passing
the skill's argument when there is one. The argument selects the base only;
the branch rebased is always the current checkout. Keep its `KEY=VALUE`
output for the rest of the run.

- **Exit 0:** continue below.
- **Exit 3:** report the reason and every file stderr lists, and what the user
  must change before re-running. Do not stash, commit, or abort anything for
  them.
- **Any other exit:** stop and report the reason from stderr verbatim.
  Nothing has changed.

Whenever the run stops after a successful prepare, report
`git rebase --abort` (if a rebase is in progress) and
`git reset --hard <RECOVERY>`.

## Baseline checks

- Run the project's checks (from its agent instructions, package scripts,
  Makefile, and CI workflow) once before rebasing and record each command and
  exit code.
- A check that already fails does not block the rebase; it is the baseline the
  post-rebase run is compared against.
- Choosing the checks stays with the model, since which commands count as a
  project's checks is judgment.

## Rebase

Run `git rebase refs/remotes/<BASE_REMOTE>/<BASE>`, adding `--rebase-merges`
when `MERGES` is above `0`, or the rebase flattens them.

On a conflict:

- Read all three stages (`git show :1:<path>` is the common ancestor) and keep
  both sides' intent.
- During a rebase `--ours` (stage 2) is the base and `--theirs` (stage 3) is
  the commit being replayed, the reverse of a merge.
- Never take a side whole and never `git rebase --skip`.
- When the code and its history do not decide a conflict, ask the user.
- Continue with `GIT_EDITOR=true git rebase --continue`.

## Verify, then publish

Re-run every baseline check the same way. A check that passed before and fails
now stops the run, as does an undecided conflict; nothing reaches the remote
while either stands.

Run `"<skill-dir>/scripts/publish.sh" <BRANCH> <PUSH_REMOTE> <PUSH_BRANCH> <LEASE>`.

- **Exit 0:** pushed, and the remote branch is the local tip.
- **Exit 3:** the push was rejected; with a lease, the remote moved since it
  was recorded. Stop and report git's stderr without retrying, and never push
  with a bare `--force`.
- **Any other exit:** stop and report the reason from stderr.

Report the base, commits replayed, each conflict and how both intents were
kept, each check before and after, the push result, and
`git reset --hard <RECOVERY>`.
