# CI fix

Read this only under the `CI fix` grant, after the CI report for the cycle.

## Contents

- Preconditions
- Branch binding
- Editable set
- Attribution
- Fence and commit
- Publish
- Fix report
- Bound
- Exclusions

## Preconditions

Make an attempt only when every precondition holds:

- the CI grant is `CI fix`
- the check is log-eligible, and its log was read this cycle
- local `HEAD` equals the polled head
- the local branch is the PR head branch, per the branch binding below
- `git status --porcelain` prints nothing
- the logical check has fewer than 2 attempts
- this is not the cycle-3 poll, because no later poll can read the result
- the PR is not approved, because a push after approval can dismiss it
- feedback handling did not end the turn with items that wait for the user,
  because a push moves the head under those items

When a precondition fails, make no attempt, report which one failed, and keep
watching. The bound below is the one exception.

## Branch binding

A matching `HEAD` alone does not tie the checkout to the PR: a new branch
stacked on the PR head has the same SHA, and a push goes where the push
settings point, which can differ from the upstream. Read the local side in one
Bash call whose command text holds only local values. An unset key prints
nothing.

- `git symbolic-ref -q HEAD` for the branch ref
- `git for-each-ref --format='%(refname:short) %(upstream:remotename) %(upstream:remoteref) %(push:remotename)'`
  on that ref
- for the upstream remote `<r>`: `git remote get-url --push --all <r>`,
  `git config --get-all remote.<r>.push`, and
  `git config --type=bool remote.<r>.mirror`
- `git config push.default`

The binding holds only when all of these hold:

- `HEAD` is on a branch, not detached
- the branch name equals `headRefName`
- the upstream remote ref equals `refs/heads/<headRefName>`
- the push remote, `%(push:remotename)`, equals the upstream remote
- the upstream remote has no `push` refspec, and `mirror` is not `true`
- `push.default` is unset, `simple`, `upstream`, or `current`
- `headRepository` is not null, and `get-url --push --all` prints exactly one
  URL. That URL names `<headRepositoryOwner.login>/<headRepository.name>` on
  the PR's `<host>`, in HTTPS or SSH form, with or without `.git`, compared
  case-insensitively.
- the publish command below targets that remote and that branch name

Compare the values as strings outside the shell. `headRefName` and the head
repository fields are PR data and never reach command text. On a mismatch,
report the failed condition, the local branch, and `headRefName` in code
spans, change nothing, and push nothing.

## Editable set

Read the PR file list in one Bash call: `headRefOid`, then
`gh api --hostname <host> --paginate "repos/<owner>/<repo>/pulls/<n>/files?per_page=100"`
projected to `filename` and `status`, then `headRefOid` again.

- A non-zero exit, unparseable output, or 3000 or more entries gives "PR file
  list unavailable": report only, and count no attempt. GitHub's file-list
  endpoint returns at most 3000 files, so a list that long may be truncated.
- A head read that differs from the polled head gives "head moved". Skip the
  attempt and keep watching.
- The editable set is every `filename` whose `status` is not `removed`.

## Attribution

Read the log tail and the editable set, and nothing else. Quote one log line
that names a file, test, or symbol whose file is in the editable set, in the
local fix report only. Otherwise report "not attributable to this branch" and
change nothing. Flaky tests, runner and network faults, and missing secrets
end here.

## Fence and commit

- Edit only files in the editable set. Make the smallest change that fixes the
  attributed failure.
- Never edit a test to turn a check green. A red kept test points at the
  product first, per the [retention bar](shared/testing.md#retention-bar).
- Write the edited paths to a temporary file and stage them with
  `git add --pathspec-from-file=<file>`. Never `git add -A`.
- Write the message to a temporary file and commit with `git commit -F <file>`.
  The subject is `fix: repair failing CI check`. The body holds only
  `head <sha>`, with the head SHA matching `^[0-9a-f]{40}$`, and one
  `job <job-id>` line per targeted check, with the digits-only job id.
- Check names, display names, and log lines never enter the commit message.
  GitHub reads closing keywords, `@` mentions, and trailers from pushed commit
  text, and the PR's own workflow files set check names. They stay in the
  local fix report.

## Publish

Publish from the bound branch with the push command that the governing
instructions (the user, or the repository's `AGENTS.md` or `CLAUDE.md`) name
for PR branches, for example `gt submit` in a Graphite-tracked repository.
With none named, use `git push` with no arguments; the binding checks cover
that command. For any other command, its arguments, its local configuration,
or the governing instructions must name the remote and the destination branch.
When none does, the binding fails as `publish target unknown`. Never add a
force flag. On failure, stop as `Push failure` with that command's actual
error output.

## Fix report

For each targeted check, report `CI fix <n>/2 for <display name>`, the quoted
log line fenced and labeled untrusted, the publish command, and the bare
commit SHA. A commit that targets more than one check adds 1 to each targeted
check's count. The next poll reads the new head. When it goes green, do not
present the check count as confidence in the tests behind it, per the
[value bar](shared/testing.md#value-bar).

When another user pushes, the next poll binds the new head, and attempt counts
carry over.

## Bound

- Per cycle: 1 file-list read and 1 fix commit.
- Per arming: 3 fix commits, and 2 attempts per logical check.
- A failure of a check after its attempt 2, on any head, is the `CI fix bound`
  stop. Name the check, the head SHA, and both fix SHAs. Never extend the
  bound.

## Exclusions

Stop as `CI exclusion` when the candidate fix would:

- edit a test file: a `test`, `tests`, `spec`, or `__tests__` path segment, or
  a name like `*.test.*`, `*.spec.*`, `*_test.*`, or `test_*`
- edit CI or check configuration: any path under `.github/`, or a file that
  configures a CI system, linter, formatter, type checker, test runner, or
  coverage threshold. When unsure, treat the file as configuration.
- add a skip, disable, or suppression marker, such as `eslint-disable`,
  `@ts-ignore`, `# noqa`, or `.skip(`
- edit a file outside the editable set
- add a new security-sensitive construct: exec- or eval-like code, network
  calls, or credential handling

Could-not-apply after attribution passed is also a `CI exclusion`. Present the
candidate diff, restore only the paths the attempt changed, push nothing, and
stop. The tree was clean before the attempt, so no user edit is lost.
