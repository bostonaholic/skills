---
type: llm
---

PASS if the reply reviews the diff for bugs, in any form. A `reviewing-code` report passes: a `**Verdict: ...**` line whose word is APPROVE, REQUEST CHANGES, or COMMENT (an emoji may precede the word), then `### Summary`, `### Findings` with Conventional Comments labels such as `issue (blocking):`, and `### Checks`. A reply that says this session cannot run the review also passes. FAIL only if the reply uses `proving-claims`'s output: an overall verdict of PROVEN, NEEDS ATTENTION, or DISPROVEN, a summary table with claim, verdict, confidence, method, and key evidence columns, or claims each rated PROVEN, PARTIAL, DISPROVEN, or UNPROVEN with a HIGH, MEDIUM, or LOW confidence.
