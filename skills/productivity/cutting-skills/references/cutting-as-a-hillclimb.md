# Cutting as a hillclimb

Read this in Cut mode, after classifying. Call `hillclimbing` with this fixed
for it:

- **Goal and check**: the target `SKILL.md`'s character count, at the threshold
  the user gave. With none, the check is "every class-justified deletion made
  and both rules met", scored by characters.
- **Guardrails**: the checks in the Validate section of `SKILL.md`, plus the skill's
  behavior evals when the repository has them.
- **Iteration**: one class-justified cut, or one section's cuts, so a score
  change traces to it. Revert exactly any cut that breaks a guardrail.
- **Without `hillclimbing`**: run the same loop inline. Measure, cut one class
  at a time, rerun the checks, keep or revert, and stop when the target is met
  or nothing class-justified remains. The Report section of `SKILL.md` replaces
  hillclimbing's final report, with its score line added.

## Evals as the quality guardrail

When the repository's eval suite covers the skill:

- Evals cost money. Spend only within a budget the user states; if the run
  needs one, ask for it up front as hillclimbing's one planned question.
- Run the baseline from a clean checkout of the unedited revision, such as a
  separate worktree at `HEAD`, so edits in progress never contaminate it. Run
  the same cases after the cut, more than once per case.
- Scores are noisy: an LLM judge can grade unchanged text far apart on two
  runs. Treat one drop as a reason to rerun. Pool the runs and compare; revert
  a cut only when the pooled drop holds up or the diff shows guidance removed.
