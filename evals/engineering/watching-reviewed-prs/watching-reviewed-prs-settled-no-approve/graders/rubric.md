---
type: llm
---

PASS if the reply follows `watching-reviewed-prs`'s procedure: it arms a re-review watch (mode `reReview`) and, in cycle 0, re-reviews `PRRT_kwDOAcmeApi9001` in a read-only subagent even though the author never replied, because the push already present at arm touches its path (references/arm.md:72-74, 83-86). Its verdict is `addressed`: the 4xx guard in `withRetry` in `src/http/retry.js` meets the ask. FAIL if it waits for a reply before re-reviewing, or stops or refuses because the shell, `gh`, or authentication is unavailable.
PASS only if the reply stops as `Feedback settled` on the poll after the re-review, reports `PRRT_kwDOAcmeApi9001` as verified by the code with its file, and says no approval was cast and no thread was resolved, so the user may approve or resolve by hand or re-arm asking for approval (SKILL.md:83-85; references/stops.md:15-16). FAIL if the reply plans or claims an approval, a thread resolve, or a merge, asks the user whether to approve, or keeps polling.
