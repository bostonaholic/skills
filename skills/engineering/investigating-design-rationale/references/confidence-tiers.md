# Confidence tiers

Every claim in the final output sits in exactly one tier, which decides
its output section and phrasing.

| Tier            | Meaning                                                                                     | Phrasing                                                                       | Output section               |
| --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| **Direct**      | An author explicitly states the reason (PR description, ticket, code comment, doc, message) | Confident, present tense, citation adjacent                                    | What We Found                |
| **Supported**   | Multiple independent pieces of indirect evidence converge                                   | Confident but derived: name each contributing piece                            | What We Found                |
| **Inferred**    | A reasonable reading of context; nothing states it                                          | Hedged — "appears to", "likely", "suggests" — with the inference chain visible | What We Can Reasonably Infer |
| **Speculative** | Plausible, but other explanations fit equally well                                          | Explicitly a guess: "one possibility is X, but no direct evidence"             | Competing Hypotheses         |
| **Unknown**     | You searched and found nothing                                                              | Name exactly what was searched                                                 | What We Don't Know           |

- Causal words — "because", "was designed to", "the team decided" — claim
  Direct or Supported evidence. Using one requires a citation immediately
  adjacent. If you cannot cite it, hedge it and move it down a tier.
- **Never cite code as evidence for its own intent.** Motivation comes
  from an external source or is labeled inference.
- **No rationalization.** Do not retrofit a clean rationale onto messy
  history, and do not turn absence of evidence into evidence of absence.
- **Surface contradictions.** When two sources disagree, present both
  with their citations. Do not quietly pick the one that fits the tidier
  narrative.
- A null result from a searched source is a finding. A skipped search is
  a blind spot — and every skip is reported by name with its reason.
