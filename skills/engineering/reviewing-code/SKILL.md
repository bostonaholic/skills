---
name: reviewing-code
description: 'Reviews a code diff (PR, branch, commit range, working tree, or a diff already in the conversation) in a fresh-context read-only subagent, because a session holding the conversation is a biased reviewer, posts its Conventional Comments findings inline and its APPROVE, REQUEST CHANGES, or COMMENT verdict to the pull request when one exists, and returns a short summary. Use when the user says "code review", or when asked to review code, a diff, or a PR, including a pasted diff, a .diff or .patch file, or a diff shown earlier; never review it inline. Not for design docs; use reviewing-design-docs. Not for a security-focused review; use reviewing-security.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Target

- The request names the diff: a PR number or URL, a branch, a commit range, or a path.
- A diff already in the conversation resolves to the refs it was taken from, or else to its text, passed verbatim.
- With no target named, the target is the working tree's diff against the base branch.
- Resolve it once into concrete base and head refs (or paths) and hand that to the reviewer. Never ask the user to restate it.

## Reviewer

- This session holds the author's conversation, so it cannot review the work ([independent review rules](shared/independent-review.md)).
- Run the [code reviewer brief](references/code-reviewer.md) in a fresh-context subagent that holds no file-editing tool.
- Give it only the resolved target, any [re-review](#re-review) inputs, and the paths of the brief and the files it links: [finding format](shared/findings.md), [testing rules](shared/testing.md), [code standards](shared/code-standards.md), [code comments rules](shared/code-comments.md), and [docs and code rules](shared/docs-vs-code.md).
- If it has a shell, it runs only the project's test command and read-only git commands.
- If no such subagent can run, stop and say so. Never review inline.

## Reused findings

- External reviewers may reuse findings after later commits.
- Before reporting a reused finding as current, ask a fresh read-only verifier to check its behavioral claim against the resolved head.
- Supply the claim and cited paths without the previous verdict or producer explanation.
- An older permalink alone does not prove the concern is fixed.
- Report verification separately; never use a cached verdict to approve newer commits or rewrite the original verdict.

## Verdict

- The report's first line must be a `**Verdict: ...**` line whose word is exactly `APPROVE`, `REQUEST CHANGES`, or `COMMENT` (match the word, not the emoji).
- When it is missing or wrong, run one new reviewer with the same inputs and name the failed contract.
- When the second report also fails, print it, name the failure, and stop. Never repair a verdict yourself, and post nothing.

## Post

- Post when the target is a pull request, or a branch whose head has an open pull request. Post without asking the user.
- Post one review on the reviewed head SHA from `### Checks`, with the verdict as its event: `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`. With `gh`: `gh api repos/<owner>/<repo>/pulls/<n>/reviews` with `commit_id`, `event`, `body`, and `comments`.
- Each finding whose `file:line` falls in the diff becomes an inline comment on that line, its body the finding verbatim. The review body is the report's `### Summary` plus every finding that cannot anchor to a diff line.
- On a re-review, post inline only findings that are new this round; the body lists each earlier finding still open.
- GitHub rejects `APPROVE` and `REQUEST_CHANGES` on the viewer's own pull request. There, post `COMMENT` and keep the verdict word in the body.
- When the post fails, fix the cause it names once (move a rejected comment into the body) and retry. When the retry fails, print the full report and the error.

## Output

Print exactly this, and nothing of the report beyond it:

```markdown
**Verdict: <✅ APPROVE | ❌ REQUEST CHANGES | 💬 COMMENT>**

<3 to 5 sentences: what was reviewed and at which short SHA; the finding count, blocking count, and the most serious finding; the test result; the review URL, or why nothing was posted.>
```

- When nothing was posted, add the report's `### Findings` section after the summary, since the findings exist nowhere else.
- When a [reused finding](#reused-findings) was verified, add its verification after the summary, apart from the verdict.
- When the reviewer used a nonstandard heading, or its read-only restriction rested on its prompt rather than its tool grants, say so in one sentence of the summary.

## Re-review

- A target is a re-review only when an earlier report of this skill in this conversation covers the same PR or branch. A working-tree or pasted-diff target never is.
- Give the reviewer the head SHA from the most recent such report's `### Checks`, its findings, and the round number: the count of those earlier reports, plus one.
- With no recorded head, run a full review and say why.
