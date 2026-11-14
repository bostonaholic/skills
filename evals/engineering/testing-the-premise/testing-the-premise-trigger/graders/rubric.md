---
type: llm
---

PASS if the reply follows `testing-the-premise`'s procedure: it writes down the premise both fixes share (the job needs more memory than the limit allows, so a higher limit fixes it), names an observation that would come out differently if that premise were false (such as memory use over time per run, or which records are being processed when it dies), and proposes a rerunnable command or script for it, before proposing another fix (SKILL.md:14-34). FAIL if it proposes another limit increase or other fix first, or skips writing the premise down.
