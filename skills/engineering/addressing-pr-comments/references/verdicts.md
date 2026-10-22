# Verdicts

Triage step 4 gives each item one verdict.

- `STILL RELEVANT`
- `ALREADY ADDRESSED` (cite the SHA; maps to F)
- `STALE`: the code was removed or rewritten
- `INACCURATE`: **rate the concern, not the premise.** A comment citing the
  wrong line, version, or symbol whose concern survives is `STILL RELEVANT`,
  and the reply corrects the citation.

Before giving a verdict:

- Rate each comment by its concern, never its account type. An automated
  comment's general rule must hold in this PR's code.
- When an ask says to match existing code, check that code first. If it is
  wrong, never offer an A that copies it: offer B, which fixes both sites and
  names each `<path>:<line>`, and E. A wrong site past the item's anchor is an
  ask beyond the anchor (G).
