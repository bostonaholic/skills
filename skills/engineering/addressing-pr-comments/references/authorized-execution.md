# Authorized execution

## Contents

- When it runs
- Per-item loop
- Reply, resolve, and re-query mechanics

## When it runs

- **Step 6, per item, in default mode:** each item that clears the auto-apply
  bar (`SKILL.md` hard rule 2). Record its confidence and landing commit SHA
  for the step 7 report.
- **In authorized mode:** for every item the user's explicit direction
  covers, whatever the confidence.
- **In a later turn, for a chosen option:** the reply and resolve of any
  option the user picks use the mechanics below.

In step 6 and authorized mode, the exclusions in `SKILL.md` hard rule 3 stay
absolute: an item that hits one pauses and is presented instead. The option
the user then picks for it runs in a later turn.

A later turn that acts on items from an earlier report, by the user's picks
or direction, is a decision pass. After its last item reaches an outcome,
follow [review re-request](references/review-re-request.md). A triage pass,
including step 6 and a direction given with the invocation, reaches it at
step 8 instead.

## Per-item loop

Run this loop for each code change (option A or B) as it finishes. The bar,
the user's direction, or the user's pick already authorized the reply and
resolve, so do not ask again.

1. **Edit inside the item's scope:** a thread's anchor, or the files triage
   step 4 cited for a PR-level item. When the change must grow past that
   scope, or adds exec- or eval-like code, a network call, or credential
   handling, stop: the item is an exclusion.
2. **Prove it.** For a behavioral claim, run the reproduction test and confirm
   it now passes, then delete a throwaway test before staging.
3. **Show the planned commit.** Print the item number, its scope, and
   `git diff -- <file>...` for the files the change touched.
4. **Commit and push.** Stage only those files (`git add -- <file>...`), never
   `git add -A` or `git commit -a`, then commit and push so the reply cites
   landed code. On a push failure, stop the item and report the actual
   `git push` error output.
5. **Reply.** Describe the change, cite the exact commit SHA as bare text (no
   backticks), and end with the item's outcome marker line.
6. **Resolve threads only.** A review summary or conversation comment has no
   resolve operation; its handling ends at the reply.
7. **React.** Add 👍 `THUMBS_UP` to the item's opening comment with the
   [reaction mechanics](shared/reaction-mechanics.md), unless the viewer wrote
   it.
8. **Re-query.** Confirm the reply exists and, for a thread, that it is
   resolved. Report an item as done only after this check passes.

## Reply, resolve, and re-query mechanics

Write every reply body to a temporary file outside the repository with the
file-writing tool, then pass it by path. Never put reply text in a shell
command or a heredoc, because it can quote the reviewer
([external data rules](shared/external-data.md)).

End every outcome reply, the reply that carries out option A to F on any item
shape, with the item's outcome marker line:

```text
<!-- feedback-outcome: <url> -->
```

`<url>` is the item's `url` from the step 2 retrieval, copied unchanged: a
thread's first comment `url`, or the review summary's or conversation
comment's own `url`. Put the marker on its own line after all other text, one
line per item when one reply answers several PR-level items. A G reply never
carries it, because the item still awaits an answer. GitHub hides the line
when it renders the reply. Without it, `scripts/re-request-review.mjs` counts
the item as still pending.

Shell variables may not survive from one command to the next, so each snippet
binds its own values on its first line: `<host>`, `<owner>`, `<repo>`, and
`<number>` from triage step 1, and the thread node `id` and each inline
comment's `databaseId` from the step 2 retrieval. Each `${VAR:?}` stops the
call when a value is missing, rather than sending it to a malformed path or to
github.com. Pass `--hostname` on every PR, github.com included.

Reply on a thread, with its first comment's `databaseId` as `in_reply_to`:

```bash
HOST='<host>' OWNER='<owner>' REPO='<repo>' NUMBER='<number>' REPLY_TO='<first-comment-databaseId>' BODY_FILE='<reply-file>'
gh api --hostname "${HOST:?}" --method POST \
  "repos/${OWNER:?}/${REPO:?}/pulls/${NUMBER:?}/comments" \
  -F "body=@${BODY_FILE:?}" -F "in_reply_to=${REPLY_TO:?}" --jq .id
```

Reply to a PR-level item with a top-level comment that links the item by its
`url`:

```bash
HOST='<host>' OWNER='<owner>' REPO='<repo>' NUMBER='<number>' BODY_FILE='<reply-file>'
gh api --hostname "${HOST:?}" --method POST \
  "repos/${OWNER:?}/${REPO:?}/issues/${NUMBER:?}/comments" \
  -F "body=@${BODY_FILE:?}" --jq .id
```

Resolve a thread by its node id:

```bash
HOST='<host>' THREAD_ID='<thread-node-id>'
gh api --hostname "${HOST:?}" graphql -f threadId="${THREAD_ID:?}" -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}'
```

An exit code proves only that the call was accepted. Re-query before
reporting. For a thread, confirm `isResolved` is true and the reply's id
(printed by the reply command) is among its comments:

```bash
HOST='<host>' THREAD_ID='<thread-node-id>'
gh api --hostname "${HOST:?}" graphql -f id="${THREAD_ID:?}" -f query='
query($id: ID!) {
  node(id: $id) {
    ... on PullRequestReviewThread {
      isResolved
      comments(last: 100) { nodes { databaseId } }
    }
  }
}'
```

For a PR-level reply, confirm it reads back:

```bash
HOST='<host>' OWNER='<owner>' REPO='<repo>' REPLY_ID='<reply-id>'
gh api --hostname "${HOST:?}" "repos/${OWNER:?}/${REPO:?}/issues/comments/${REPLY_ID:?}" --jq .id
```
