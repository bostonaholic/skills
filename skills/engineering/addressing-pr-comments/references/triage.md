# Triage

## Contents

- Step 1: Resolve the PR
- Step 2: Fetch all feedback
- Step 3: Build the open-item set
- Step 4: Verify each item
- Step 5: Classify each item
- Step 7: Present the report and punch list
- Step 8: Stop and hand off

Step 6 is in [authorized execution](references/authorized-execution.md).

## Step 1: Resolve the PR

```bash
# No argument: the current branch's PR
gh pr view --json number,url,baseRefName

# A number or URL was given
gh pr view "<number-or-url>" --json number,url,baseRefName
```

Take `owner`, `repo`, and `number` from `url`. On a GitHub Enterprise PR, pass
`--hostname <host>`, the host of `url`, to every `gh api` call.

## Step 2: Fetch all feedback

Run the shared pull-request comment retrieval and complete pagination before
triage. Do not substitute `gh pr view --json reviews` or the REST
`pulls/{n}/comments` endpoint: neither exposes thread resolution.

When `watching-authored-prs` passes its fully paginated poll result, use that
result, do not fetch again, and drop its already-triaged node ids.

## Step 3: Build the open-item set

Fetch the invoking identity once:

```bash
VIEWER="$(gh api graphql -f query='{ viewer { login } }' --jq '.data.viewer.login')"
```

A login matches GitHub's identifier charset, so it is safe inside a
double-quoted `--jq` filter. Never interpolate it into a GraphQL query string.

Include every unresolved thread, every review summary with a non-empty body,
and every conversation comment not already triaged by a caller. The three
connections are disjoint; never take inline comments from a review summary.
Keep `isOutdated` threads and flag them: an outdated thread is not resolved,
and its concern can survive a rebase.

Drop the viewer's own items by default: a review summary or conversation
comment `$VIEWER` wrote, and a thread whose comments are all `$VIEWER`'s.
They are the user's own notes, not feedback to address. Include them only when
the user asks, and even then keep dropping the viewer's conversation comments
whose first line starts with a review-record marker
(`<!-- <producer>:pr-comment` and a space): a tool wrote those to record a
deferred finding or review disposition. Count every dropped item for step 7.

Every item left in the set appears in the step 7 report exactly once, keyed by
node id. Nothing is dropped silently; an ambiguous item surfaces as
`NEEDS CLARIFICATION`.

## Step 4: Verify each item

Do this for each item before any classification or recommendation:

1. **Read the current code.** For a thread, read `path` around `line` or
   `startLine` and compare it with the comment's `diffHunk`. For a PR-level
   item, identify and cite the files its ask concerns; if that scope is
   unclear, the item needs clarification. Read the whole thread: a later
   comment can already answer the ask.
2. **Check the diff since the comment.** Run
   `git diff origin/<base>...HEAD -- <path>` and
   `git log --oneline -- <path>`. Did a later commit already address, move, or
   delete the code?
3. **Prove behavioral claims with a test.** When the comment asserts runtime
   behavior (a bug, an edge case, a race), reading code is not proof. The
   evidence is a named test, cited by file path and test name, plus its run
   result:
   - Prefer an existing test that exercises the claimed behavior. Cite
     `<test-file>:<line>` and the test name, run it, and record pass or fail.
     A nearby test that only touches the same code does not count.
   - Otherwise write a throwaway reproduction test, run it, record the
     result, and quote its key assertion in the evidence. A test that fails
     as the reviewer predicted proves `STILL RELEVANT`. One that passes
     against the claim proves `INACCURATE` or `ALREADY ADDRESSED`. Never stage
     it. Delete it now, unless the item may clear the auto-apply bar: then
     keep it unstaged for the red-green run, which deletes it before the
     commit.
   - When the behavior is too costly to test (external services, production
     data), fall back to code-reading evidence and say so in the verdict line.
4. **Assign a verdict**, citing the file, line, or commit that proves it:
   - `STILL RELEVANT`: the code is unchanged and the ask still applies.
   - `ALREADY ADDRESSED`: a later commit resolved the concern (cite its SHA
     as bare text).
   - `STALE`: the code was removed or rewritten, so the comment no longer
     applies as written.
   - `INACCURATE`: the claim does not hold against the code.
5. **Rate confidence** against the auto-apply bar in `SKILL.md` hard rule 2.

Post nothing during verification. A reaction waits for the decision that
picks it.

`ALREADY ADDRESSED` maps to option F. `STALE` and `INACCURATE` usually map to
a reply that answers the reviewer (C), or to a decline (D) where the claim
does not hold. An unclear ask maps to G, whatever its verdict, and so does a
one-way-door choice the decision method returns to the user.

## Step 5: Classify each item

Decide what each item asks for: **Code change** (including a suggested-change
block), **Question**, **Suggestion** ("nit:", "consider"), **Praise / FYI** (no
ask), **Blocking** ("blocking:", "must fix", or a review that requested
changes), or **Outdated** (`isOutdated: true`).

The class decides which options step 7 offers. When the class is ambiguous,
keep both candidate classes and mark the item `NEEDS CLARIFICATION`.

## Step 7: Present the report and punch list

Report in two sections:

1. **Auto-applied**: one line per step 6 item with its confidence, its landing
   commit SHA, and the reaction placed.
2. **Needs your decision**: one block per remaining item with the comment, 2-4
   options tailored to it, and exactly one recommendation based on the
   verdict, the class, and the current diff.

When step 3 dropped any items, end the report with
`Skipped <n> of your own comments.`. Omit the line when n is 0.

Option menu (offer the ones that apply):

- **A. Apply the change**: edit `<file>` to do `<specific change>`. When the
  ask is an image rather than code, capture it, then call the Skill tool with
  `attaching-pr-screenshots` against this PR to put it in the description.
  When that skill is not installed, say so and leave the description
  unchanged.
- **B. Apply a variation**: `<a variant that meets the concern differently>`.
- **C. Reply with the answer**: `<one-line reply sketch>`.
- **D. Decline (will not fix)**: reply with `<one-line rationale>`.
- **E. Defer**: file a follow-up issue or TODO, then resolve with its link.
- **F. Mark resolved as-is**: the current code already addresses it; resolve
  citing the commit or line.
- **G. Needs clarification**: ask the reviewer when the ask is unclear;
  present the choice to the user when the user owns it. Touches no code.

C answers a question you understood; G asks. D and G are exclusions
(`SKILL.md` hard rule 3), so neither runs automatically. Every chosen reply
and resolve follows the mechanics in
[authorized execution](references/authorized-execution.md).

Each option places this reaction on the item's opening comment when the user
picks it, and the block states it. Never react to a comment the viewer wrote.

| Option                    | Reaction                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A. Apply the change       | 👍 `THUMBS_UP`                                                                                               |
| B. Apply a variation      | 👍 `THUMBS_UP`                                                                                               |
| C. Reply with the answer  | none                                                                                                         |
| D. Decline (will not fix) | 👎 `THUMBS_DOWN` when the decline rests on an `INACCURATE` verdict; none when only priority or scope differs |
| E. Defer                  | 👍 `THUMBS_UP`                                                                                               |
| F. Mark resolved as-is    | 👍 `THUMBS_UP`                                                                                               |
| G. Needs clarification    | none                                                                                                         |

The user can override any reaction; say so when presenting a 👎. A reaction
never replaces the reply the chosen option calls for.

Use this block format exactly, dropping option lines that do not apply. A
PR-level item shows `PR-level` in place of `<path>:<line>`:

```text
[#] <path>:<line>  —  @<author>  —  <class>[, OUTDATED]
    > <1–2 line excerpt of the comment body>
    URL: <item url>
    Verified: <STILL RELEVANT|ALREADY ADDRESSED|STALE|INACCURATE>  —  <one-line evidence>
    Reaction: none yet — the option you pick places it
    Confidence: <NN%>  —  <the auto-apply check it failed>

    Options:
      A. <concrete option tailored to this comment>  →  reacts 👍
      B. <alternative option>  →  reacts 👍
      C. <reply-only option>  →  reacts none
      D. <decline option with rationale sketch>  →  reacts <👎|none>

    Recommendation: <A|B|C|D|…>  —  <one-line why>
```

Group blocks by file, PR-level items after files, and `NEEDS CLARIFICATION`
items last. Number blocks globally so the user can pick by number.

## Step 8: Stop and hand off

Before ending the turn, confirm the working tree matches its state at step 1.
Do not begin editing, posting, or resolving any `Needs your decision` item in
this turn. End with a short hand-off prompt, for example:

> Tell me which items to address and which option to take for each (default:
> the recommendation). I will not touch anything else until you agree.
