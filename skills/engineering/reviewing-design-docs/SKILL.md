---
name: reviewing-design-docs
description: 'Reviews a technical design document or RFC adversarially in fresh-context read-only subagents, one per lens, (coverage, decisions, edge cases, consistency, risks, citations, scope) and returns one merged report with a verdict. Use when the user says "review this design doc", or when asked to review a design doc, RFC, or technical design. Not for code diffs; use reviewing-code.'
effort: high
argument-hint: "[<design-doc-path-or-url>]"
---

# Engineering Design Doc Review

## Input

- The request names the path to one design document.
- When it is a URL or pasted text, save it as Markdown in a scratch file outside the repository and review that path; when a fetch fails, report the URL and the error.
- When the request names no document, names a directory, or names no readable file, ask for the path and wait. Never guess.

## Reviewer

- This session holds the author's conversation, so it cannot review the document ([independent review rules](shared/independent-review.md)).
- Run the [design reviewer brief](references/design-reviewer.md) once per lens, each in its own fresh-context subagent with read and search tools only. The lenses, in order: `naive-reader`, `decisions`, `readiness`, `accuracy`. Every lens runs on every document.
- Give each lens run the document's absolute path, its lens name, and the paths of the [report format](references/report-format.md) and [finding format](shared/findings.md), which every run reads, the [design template](references/design-template.md), which `readiness` reads, and the [decision-record rules](shared/decisions.md), which `decisions` reads.
- After every lens report passes the verdict line check, run the [synthesizer brief](references/synthesizer.md) in a fresh-context subagent with read and search tools only. Give it the document's absolute path, every lens report verbatim and labeled with its lens, and the paths of the report format and finding format.
- Pass no author discussion, and give no lens another lens's report.
- If no such subagent can run, stop before any lens runs and say so. Never review inline.

## Verdict and relay

- Apply this verdict line check to each lens report and to the merged report.
- The report's first line must be exactly `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`.
- The check stays with the model: it compares one line the session already reads to relay the report.
- When a report fails, run one new subagent with the same inputs and name the failed check. A synthesizer retry reuses the same lens reports and reruns no lens.
- When a lens report fails twice, wait for every other lens run, with its one retry, to finish, and run no synthesizer. When the merged report fails twice, stop at once.
- On either stop, print the latest attempt of each report verbatim, labeled with its lens or as `merged`; a first failed attempt never prints. Name the failed check, say no verdict was reached, and stop. Never repair a verdict yourself.
- Print the merged report verbatim.
- When the read-only restriction of any subagent rested on its prompt rather than its tool grants, say so in one line after the merged report, or after the printed reports on a stop.
- Do not revise the document; on REQUEST CHANGES the user decides how.
- Write no file beyond the scratch copy.
