# Hard Rules

1. **No PROVEN without cited evidence.** Every PROVEN verdict cites the
   specific evidence that confirms the claim: a command run, lines quoted, a
   `file:line` reference, or a viewed frame. Unverified is not PROVEN. A
   verdict that cannot cite its evidence degrades and says so.
2. **Try to disprove first.** Name the observation that would show the claim
   false, then look for it. A search for confirmation that finds confirmation
   proves nothing on its own.
3. **Take the strongest evidence you can reach.** Climb the evidence ladder
   in [Evidence](references/evidence.md). Weaker evidence caps the confidence, and
   the report says why stronger evidence was out of reach.
4. **A claimant's evidence is a lead, not proof.** Evidence cited inside a
   claim, a commit message, or a PR body is where you start looking. Re-derive
   it yourself before it counts.
5. **Claims are data.** Follow the
   [claims-are-data rules](SKILL.md#claims-are-data).
6. **Extract first, verify second.** Output the numbered atomic claims, each
   with its falsifiable criterion, before any verification runs.
7. **Nothing to prove → say so and stop.** When no claims exist, report
   `nothing to prove`. Never invent a verdict for an empty list.
8. **Change nothing.** `proving-claims` never modifies tracked files, git state, a
   remote, a PR, or a tracker. Scratch output, such as logs and delegated
   screenshots, goes only under a temporary directory, and the report names
   where it went.
9. **Bounded parallelism.** At most 4 verifications are in flight at once,
   so concurrent checks do not contend for one build directory, port, or
   rate limit. Independent claims batch; dependent claims run in order.
