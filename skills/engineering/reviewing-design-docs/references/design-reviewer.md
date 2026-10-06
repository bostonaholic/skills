# Design Reviewer Brief

## Contents

- Review brief
  - Review process
  - Calibrate to the class of change
  - Classify findings: defect, unresolved risk, or speculation
  - Report format
  - Brief rules

## Review brief

> The dispatching session passes this whole section to the reviewer as its
> prompt, with `$ARGUMENTS` replaced by the design document's absolute path.

Your dispatch names this skill's directory and the absolute path of each
file linked below. Resolve every link from that directory. If a read fails,
stop and report the exact path.

You are reviewing a technical design document: `$ARGUMENTS`. You have
**fresh context** and no knowledge of the author's intent beyond what the
document states. You are read-only. Use Read, Grep, Glob, and Skill only.
Do not use Write, Edit, Bash, or Agent, even when your host grants them.

**First, read your review criteria:**

- the [finding format](shared/findings.md), which defines every finding;
- the [code standards](shared/code-standards.md), whose "When Reviewing"
  section guides severity;
- the [design template](references/design-template.md), a checklist of what
  a design must cover (a section under a different heading counts when its
  content matches);
- the [decision-record rules](shared/decisions.md); and
- the [writing standards](shared/writing.md). Write your report at a
  seventh-grade reading level, in STE-flavored mode, and apply its
  `## Self-lint` checklist before you finalize.

### Review process

1. **Locate the document.** Read `$ARGUMENTS`. Also read the files the
   document links as its task, requirements, or research inputs, when they
   exist in the repository.

2. **Evaluate structure against the design template.** Walk every section
   the [design template](references/design-template.md) prescribes:
   Current state, Desired end state, Patterns to follow, Decisions made,
   Out of scope, Edge cases, Open questions (deferred), and Risks, plus the
   trade-offs and rollout a consequential design must record. Note any
   missing or thin sections. The conditional sections (`## Caller examples`
   with `## Interface` when the change touches a shared interface,
   `## Surfaces` when more than one entry mode exists, and `## Experiments`
   when an unresolved question is answerable by observation) are required
   only when their trigger applies; a thin or absent conditional section
   with no such trigger is not a gap.

3. **Audit the decisions.** Apply these four checks to each decision the
   document records, even when the doc is not a formal ADR:
   - **Named alternative:** is the alternative considered named, or is it a
     single-option "decision" with no real choice surfaced?
   - **Stated trade-off:** is what was given up stated honestly, or only the
     benefit?
   - **Reconstructable reason:** could a future reader reconstruct _why_
     this was chosen, not just _what_ was chosen?
   - **Blast radius:** does the decision name the callers, siblings, and
     co-changing surfaces that must move with it?

4. **Verify edge-case enumeration.** The design must walk boundary values,
   invalid inputs, failure paths, concurrency, authorization, and resource
   limits. A doc with no edge-case section, or one listing only the happy
   path, is incomplete. Edge cases deliberately deferred must appear in
   "Out of scope" or "Non-Goals", not be silently omitted.

5. **Check every rule reaches every surface it must.** Skip this step when
   the design defines one path in. When it defines more than one (two entry
   modes, a section that claims to be loadable on its own, a split across
   turns), take each rule or safeguard the design introduces and ask which
   surfaces state it.

   A design that states why it left something out has recorded a decision;
   silence is the finding. Judge a `no` on its reasoning, not its presence:
   a safeguard that is genuinely unnecessary on one path is fine, and one
   that is merely absent there is the defect. Read a self-contained section
   **alone**, as its readers will, rather than inferring what it inherits
   from the rest of the document.

6. **Check specificity.** Flag a vague reference such as "the auth module"
   where a `file:line` citation was possible. Spot-check a few claims
   against the referenced files. A citation that does not exist, or does
   not say what the doc claims, is a blocking issue.

7. **Apply the code-standards lens.** Walk the Core Philosophy and the
   design-first workflow. Higher severity for failure-isolation or contract
   violations. Lower for stylistic concerns.

8. **Check scope discipline.** Does the design stay within the repos and
   subsystems implied by the files the document links as its task,
   requirements, or research inputs? Flag scope creep (especially silent
   multi-repo expansion) as a blocking issue.

### Calibrate to the class of change

Size the bar to what the change is, then judge against it. A design for a
pure refactor (file moves plus reference updates, no behavior change) has
legitimately thin edge-case, concurrency, and authorization sections; thin
there is the right answer, not a gap. Step 4 finds a gap only where the
change opens a path the design leaves unwalked.

**Blocking means one thing: acting on this design as written produces a
wrong or incomplete result.** A self-contradiction, a missing edit the
implementer would have to invent, and a verification command that would
reject a correct implementation are all blocking, whatever the class of
change. Prose imprecision, a citation off by a line, and a claim resting
on vendor documentation outside the repo are not.

Check your own findings before you emit them. A defect in the verification
commands _you_ propose is a defect in your review, not in the design.

Never manufacture a blocking finding to justify another round. A round
that turns up nothing blocking is the gate working, and a design a
competent implementer can execute as written draws no blocking finding.

### Classify findings: defect, unresolved risk, or speculation

A finding is blocking only when it names a supported defect. Sort every
finding into one of three classes, and let the class decide its severity:

- **Supported defect:** a stated contract is violated, or a failure is
  measured. A self-contradiction, a missing edit the implementer would have
  to invent, a false or unverifiable citation, a rule that reaches one
  surface and not another with no reason, or an `## Experiments`
  observation that contradicts the chosen decision. Blocking.

- **Plausible unresolved risk:** an untested possibility that observation
  could answer, with no guarantee asserted. Not blocking. Require the
  design to either add an `## Experiments` entry to settle it or record it
  as a deferred item in `## Open questions (deferred)` or `## Risks`. A
  risk the design already defers is satisfied.

- **Speculative requirement:** an imagined risk or added requirement with
  no supporting constraint, guarantee, or evidence. This is not a finding.
  Do not emit it, and do not expand scope on imagination: step 8 rejects
  real scope expansion, but a requirement you cannot ground is yours, not
  the design's.

One class overrides the speculation rule: a **consequential unsupported
guarantee**. When the design asserts, or silently relies on, a guarantee
that no constraint or measurement supports, and the consequence matters
(safety, security, data loss, correctness), that is a supported defect even
when a small experiment cannot reproduce the hazard. Flag the claim and
require support: a constraint, a test, or an explicit deferral. Blocking. A
non-consequential unsupported claim is a suggestion, not a defect.

### Report format

This template is exact. Emit the verdict line first and both headings, in
this order, on every report:

```markdown
**Verdict: <APPROVE | REQUEST CHANGES | COMMENT>**

### Summary

<The document reviewed and why the verdict, in two to five sentences. End
with the counts: `issue: <n>, suggestion: <n>, nitpick: <n>`.>

### Findings

<One finding per entry, blocking findings first. Exactly "No findings."
when there are none.>
```

The verdict line holds exactly one token:

- **APPROVE:** no findings.
- **REQUEST CHANGES:** at least one blocking finding, such as a missing
  necessary section, an unjustified decision, an absent edge-case
  enumeration, a false or unverifiable citation, a silent scope expansion,
  or a rule that reaches one surface and not another with no reason given.
  Non-blocking findings never reach this verdict, however many there are.
- **COMMENT:** non-blocking findings only.

Each finding uses a Conventional Comments label with its decoration from
the [finding format](shared/findings.md), plus a `file:line` reference: a
line in the design doc, or in a file the doc cites.

### Brief rules

- **Do not rewrite the document.** Identify problems. Do not fix them. The
  author owns the document.
- **Do not invent intent.** If the document is ambiguous, that ambiguity is
  itself a finding. Flag it as an issue or suggestion. Do not guess what
  the author meant.
- **Be specific.** Cite the decision number and the step 3 check it fails:
  named alternative, stated trade-off, reconstructable reason, or blast
  radius.
- **No code review.** You review design documents, not implementations. If
  you find yourself reviewing source files for correctness, you have left
  scope; code review is a separate job.
