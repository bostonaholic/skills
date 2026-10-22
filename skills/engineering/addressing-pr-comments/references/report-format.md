# Report format

Triage step 7 reports in this shape.

- Applied items, one line each (option, confidence, commit SHA or reply,
  reaction).
- Then one block per paused item in exactly this format, with 2 to 4
  [options](references/options.md) tailored to the item and `PR-level` in place of
  `<path>:<line>` for a PR-level item:

```text
[#] <path>:<line>  —  @<author>  —  <class>[, OUTDATED]
    > <1–2 line excerpt of the comment body>
    URL: <item url>
    Verified: <STILL RELEVANT|ALREADY ADDRESSED|STALE|INACCURATE>  —  <one-line evidence>
    Reaction: none yet — the option you pick places it
    Confidence: <NN%>  —  <the apply check it failed>

    Options:
      A. <concrete option tailored to this comment>  →  reacts 👍
      C. <reply-only option>  →  reacts none

    Recommendation: <A|B|C|D|…>  —  <one-line why>
```

- Group by file, PR-level after files, clarification items last; number blocks
  globally.
- End with `Skipped <n> review-record comments.` when `skippedReviewRecords` is
  above 0.
