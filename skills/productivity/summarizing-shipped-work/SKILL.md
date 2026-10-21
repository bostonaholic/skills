---
name: summarizing-shipped-work
description: Summarizes the user's merged GitHub PRs for a timeframe into a grouped, linked shipped-work report with highlights, and offers to update a brag document. Use when asked what the user shipped (this week, last month, a quarter, since a date), for a status update, or to update a brag doc.
argument-hint: "[timeframe] [owner...]"
---

# Summarizing shipped work

## Scope

Ask nothing up front. Search only the owners the user names, if any. When the
user asks for work only, leave out personal and trivial repositories and name
them in one line at the end of the report.

## Timeframe

Resolve `<skill-dir>` to this skill's absolute directory. Map the request to
one `PERIOD` token from the header of `scripts/resolve-timeframe.mjs`
(`this-week` when the user names none) and run:

```sh
node "<skill-dir>/scripts/resolve-timeframe.mjs" PERIOD
```

It prints `START END`. On exit 64, fix the token and rerun.

## Fetch merged PRs

With `<out>` a scratch directory, run:

```sh
"<skill-dir>/scripts/fetch-shipped-prs.sh" START END [OWNER...] > <out>/shipped.jsonl; echo "rc=$?"
```

On a non-zero exit, report the script's error and stop: the file is partial.
Do not summarize, list, or group any PR from it, and do not offer to, even
labeled as partial. Exit 64 means a bad date or argument: fix the call and
rerun. For any other error, such as an HTTP 5xx, tell the user to rerun once
it clears.

## Group and summarize

**Group by product or system, not by repository**: a service change, its UI
screen, and its docs are one item. Within each area, add bold theme
sub-headers, and put refactors, test infrastructure, CI, and lint fixes under
a final **Engineering health** sub-header for that area.

**One sentence per change**, in plain words for the system's users. Merge PRs
that ship one change into one line; collapse a run of similar PRs into one
line with a count.

**Drop** version bumps, reverts of work merged in the same window, and PRs
whose only content is fixing the previous PR.

**Links end each line**, in parentheses, comma-separated: PRs, then issues.

- PR label: `pr_label`.
- Issue label: the ticket key (`OPS-123`), or `repo#number` for a GitHub
  issue.
- Issue source, in order: the URLs in `title_ticket_links`; otherwise the
  `issue_links` the body cites as the PR's own ticket. Skip tickets the body
  mentions only as related context or follow-up work.
- A `title_ticket_links` key with a null URL stays unlinked unless an issue
  tracker tool in the session gives its URL.

## Report

Markdown. Keep the section order; fit areas, themes, and counts to the work.

```markdown
# Shipped <START> to <END>

## Highlights

- <one sentence>. ([deploy-service#781](…), [web-console#1513](…), [OPS-123](…))
- … 3 to 5 in all

## <Area>

**<Theme>**

- …

**Engineering health**

- …

## Themes

- 2 to 4 bullets naming patterns across the period.

Left out as personal or trivial: <repos>.
```

Rank highlights by effect on users or the business, above refactors and docs.
Order areas by how much shipped. Themes claim only what the PR list supports.
The left-out line is only for a work-only request. Write plainly: no
metaphors, no intensifiers, no "just".

## Brag document

After the report, offer to add the highlights to the user's brag document when
the user names one or one is recorded in their AGENTS.md or memory; otherwise
end with the report. Match the document's existing structure, show the exact
proposed diff, and write only after approval. Add text; never overwrite or
remove existing text.
