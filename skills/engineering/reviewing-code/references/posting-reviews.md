# Posting reviews

Read this at Input to resolve a PR target, and again at step 5 to post the
review. Invoking the skill on a PR target is the request to post the review
on that PR, so nothing here asks the user first.

## Contents

- Classify the argument
- Look up the PR
- State
- Branch gate
- Local commits
- Target and at-head flag
- Errors and ownership
- Run the script
- Session lines
- Exit codes

## Classify the argument

Classify `$ARGUMENTS` before any shell use. Three forms get a PR lookup:

- a bare PR number matching `^[0-9]+$`, even when a branch has that name;
- a PR URL matching
  `^https://[A-Za-z0-9.-]{1,253}/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$`;
- a branch that matches `^[A-Za-z0-9._/-]{1,255}$` with no leading `-`,
  checked under `LC_ALL=C`. A branch name outside this allowlist gets no
  lookup, and the branch review runs without a post.

A commit range, a path, or no argument gets no lookup, keeps the resolution
in `SKILL.md` Input, and never posts.

Even a validated URL never appears in a shell word, because double quotes
do not stop `$(...)` ([never interpolate](shared/external-data.md)). Split a
matched URL with parameter expansion into `$ARG_HOST`, `$ARG_OWNER`,
`$ARG_REPO`, and `$ARG_NUMBER`, so the argument string itself reaches no
command. Use parameter expansion, not `$BASH_REMATCH`: zsh matches the same
pattern but leaves `$BASH_REMATCH` unset.

```bash
REST="${ARGUMENTS#https://}"
ARG_HOST="${REST%%/*}"  ; REST="${REST#*/}"
ARG_OWNER="${REST%%/*}" ; REST="${REST#*/}"
ARG_REPO="${REST%%/*}"
ARG_NUMBER="${ARGUMENTS##*/}"
```

## Look up the PR

Resolve the PR in one projected call, never a bare `gh pr view`, whose
default output prints the untrusted title and body. With a URL argument,
pass `--repo "$ARG_HOST/$ARG_OWNER/$ARG_REPO"`. With a bare number, drop
`--repo`, and the checkout supplies the repository:

```bash
gh pr view "$ARG_NUMBER" --repo "$ARG_HOST/$ARG_OWNER/$ARG_REPO" \
  --json url,state,headRefOid,baseRefOid,baseRefName \
  --jq '{url, state, headRefOid, baseRefOid, baseRefName}'
```

For a branch, make the same call with the branch name as the positional and
no `--repo`. The allowlist admits no shell metacharacter and no leading
`-`, so the matched name can appear in the command text.

Validate `url` with the PR URL pattern above, and validate `headRefOid` and
`baseRefOid` with `^[0-9a-f]{40}$`. Split `url` with the same parameter
expansion into `$HOST`, `$OWNER`, `$REPO`, and `$NUMBER`. Take them from the
canonical `url`, never from the raw argument: a PR URL path names the
**base repository**, where the review must land. On a fork PR, head
repository fields name the contributor's fork.

## State

`OPEN` can post. `MERGED` or `CLOSED` marks the target not posted, and step
5 runs no script. For a PR number or URL, the review still runs on the SHA
pair, because the user asked for a review. For a branch, the branch review
runs.

## Branch gate

A branch is a PR target only when its PR is `OPEN` and
`git rev-parse --verify refs/heads/<branch>^{commit}` prints `headRefOid`.
Otherwise the branch review runs without a post, and step 5 prints the
`Not posted:` line for the reason. A branch that passes the gate continues
as a PR number does, from Local commits on.

## Local commits

The reviewer diffs two commit SHAs, so both must exist in this clone:

1. Run `git cat-file -e <sha>^{commit}` for `headRefOid` and `baseRefOid`.
2. When either fails, run one `git fetch` that asks only for the missing
   sides: `pull/<n>/head` for the head, `refs/heads/<baseRefName>` for the
   base. Use the first remote, in `git remote` order, whose
   `git remote get-url` names `<owner>/<repo>` on `<host>`, with or without
   a trailing `.git`, over HTTPS or SSH.
3. Before the fetch, the remote name and `baseRefName` must each match
   `^[A-Za-z0-9._/-]{1,255}$` with no leading `-`, checked under
   `LC_ALL=C`. Refuse a failure without normalizing it.
4. After the fetch, or when nothing was missing, `git cat-file -e` for both
   SHAs and `git merge-base <base-sha> <head-sha>` must succeed.

## Target and at-head flag

The reviewer's target is `<base-sha>...<head-sha>`, passed in place of any
branch name. A base or head push during the review then changes nothing
the reviewer diffs.

The at-head flag is yes when `git rev-parse HEAD` equals the head SHA and
`git status --porcelain --untracked-files=normal` prints nothing, untracked
files included, whatever `status.showUntrackedFiles` says. Record
it with the SHA pair.

## Errors and ownership

An Input failure stops a PR number or URL before dispatch with the
`Stopped before review:` line below. For a branch, an Input failure only
marks the target not posted, and the branch review runs with the base and
head refs that `SKILL.md` Input resolves. The session lines close the set of
reasons.

The session holds the canonical URL, the state, both SHAs, the at-head
flag, and the step 2 shell grant for the life of the run. The fetch adds
git objects and can update `FETCH_HEAD` and remote-tracking refs. It
changes no local branch, index, or working-tree file.

## Run the script

The script needs `node` and `gh` (`command -v node gh`). When either is
missing, print the `<tool> is not installed` line and run nothing.

Write the report alone to a file in the host's temporary directory with the
file-writing tool. The file holds the report from its verdict line to its
last line, byte for byte as step 4 printed it, without the
heading-deviation or restricted-subagent lines. The body reaches GitHub on
the script's stdin, never in command text
([never interpolate](shared/external-data.md)). Then run the script, where
`<skill-dir>` is this skill's absolute directory and the other values are
the validated canonical URL, the head SHA, the file path, and `at-head` or
`off-head` from the at-head flag:

```bash
node "<skill-dir>/scripts/post-review.mjs" "<pr-url>" "<head-sha>" "<report-file>" <at-head|off-head>
```

The script reads the verdict from the file's first line, checks the
checkout, and reads the PR from GitHub again. It applies the downgrades,
posts one review pinned to the head SHA, and reads it back by review id. It
never retries. The report file can be deleted after the run.

## Session lines

Every line the session prints after the report comes from this table.
Placeholders in angle brackets take one value each. When several
`Not posted:` rows apply, print only the first in table order.

| Source                                                                                                | Session line                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `posted <EVENT> <review-url>`                                                                         | `Posted <EVENT> review on <pr-url>: <review-url>`                                                                                                            |
| `not-posted pr-merged` or `not-posted pr-closed`, or Input state `MERGED` or `CLOSED` (no script run) | `Not posted: PR #<n> is <state>.` with `<state>` as `merged` or `closed`                                                                                     |
| `not-posted read-failed`                                                                              | `Not posted: the PR read before posting failed.` plus stderr verbatim, then `If the token expired, run gh auth login.`                                       |
| `not-posted gh-unavailable`, or `command -v node gh` finds a tool missing (no script run)             | `Not posted: <tool> is not installed.`                                                                                                                       |
| `failed http-<status>`                                                                                | `Post failed (HTTP <status>):` plus stderr verbatim. Add the pending-review hint when stderr names a pending review, and suggest `gh auth login` on HTTP 401 |
| `failed gh-exit-<code>`                                                                               | `Post failed (gh exit <code>):` plus stderr verbatim, then `The review can still have posted. Check <pr-url> before you rerun.`                              |
| `unverified <reason>`                                                                                 | `Post unverified: <reason>. Check <pr-url> before you rerun.`                                                                                                |
| `downgraded <EVENT> self-authored`                                                                    | `Review event changed from <EVENT> to COMMENT: GitHub does not allow <EVENT> on your own PR.`                                                                |
| `downgraded APPROVE auto-merge`                                                                       | `Review event changed from APPROVE to COMMENT: auto-merge is on, and an approval can merge the PR with no human review. Approve by hand to merge.`           |
| `downgraded APPROVE head-moved`                                                                       | `Review event changed from APPROVE to COMMENT: the PR head moved after the review.`                                                                          |
| `downgraded APPROVE off-head`                                                                         | `Review event changed from APPROVE to COMMENT: the checkout was not at the PR head for the whole review. Check out the PR head for a test-backed verdict.`   |
| `head-moved <sha>`                                                                                    | `The PR head moved to <sha>. The review is pinned to <reviewed-sha>.`                                                                                        |
| Exit 2                                                                                                | `Not posted: <stderr reason>.`                                                                                                                               |
| Step 3 fails twice on a PR target                                                                     | `Not posted: the report failed the verdict contract.`                                                                                                        |
| Step 2 granted no shell                                                                               | `Not posted: the reviewer had no shell, so it could not diff or read the PR head.`                                                                           |
| Working tree, commit range, or path target                                                            | `Not posted: the target is <kind>, not a PR. Pass the PR number or URL to post.` with `<kind>` as `the working tree`, `a commit range`, or `a path`          |
| Branch tip differs from the PR head                                                                   | `Not posted: local branch <branch> is at <tip>, but PR #<n>'s head is <head>.`                                                                               |
| Input failure, PR number or URL                                                                       | `Stopped before review: <reason>.` plus the failing command's stderr verbatim                                                                                |
| Input failure, branch                                                                                 | `Not posted: <reason>.` plus the failing command's stderr verbatim. The branch review still runs                                                             |

The pending-review hint tells the user to submit or delete their pending
review on the PR, then rerun. `<stderr reason>` is the rest of the script's
stderr line that starts with `post-review.mjs:`.

Input failure `<reason>` is one of this closed set:

- `<name> has a character outside the branch allowlist`, for the branch argument, the remote name, or `baseRefName`.
- `gh is not installed`.
- `gh pr view <arg> returned no PR`. This covers a branch with no PR, an unauthenticated `gh`, and an older `gh` with no `baseRefOid`.
- `the lookup returned a URL or SHA that fails validation`.
- `no git remote names <owner>/<repo>. Add one with git remote add`.
- `git fetch from <remote> failed`.
- `commit <sha> is still missing after the fetch`.
- `the PR commits share no merge base in this clone. Run git fetch --unshallow`.

The session prints lines in the script's order. The word "Posted" appears
only for the `posted` outcome. A `downgraded` line names the event the
script sent, so it stays true when the POST fails
([verified results rules](shared/verified-results.md)).

## Exit codes

- **0:** the review posted and read back. Print the `Posted` line, then any
  note lines.
- **1:** any other outcome after the argument checks. The table names each
  case. Never claim the review posted. On an authentication failure (an
  `http-401` status, or stderr that names authentication), suggest
  `gh auth login` or `gh auth refresh`.
- **2:** a usage fault, with no GitHub call. Print the `Exit 2` row.
