---
name: summarizing-shipped-work
description: Summarizes the user's merged GitHub PRs for a timeframe into a grouped, linked shipped-work report with highlights, and offers to update a brag document. Use when asked what the user shipped (this week, last month, a quarter, since a date), for a status update, or to update a brag doc.
argument-hint: "[timeframe] [owner...]"
---

# Summarizing shipped work

Turn merged pull requests into a grouped, linked record of shipped work. The
report serves two uses: a short status update for a team, and a running brag
document for review time.

## Scope

Ask nothing up front. Search within the owners (users or organizations) the
user names; with none named, search all of the user's merged PRs. When the
user asks for work only, leave out personal and trivial repositories and name
them in one line at the end of the report.

## Timeframe

Resolve the request to inclusive `START` and `END` dates (`YYYY-MM-DD`) and
state them in the report heading. Weeks start on Monday; a current week, month,
or quarter ends today. With no timeframe, use this week.

## Fetch merged PRs

Resolve `<skill-dir>` to this skill's absolute directory, pick a scratch
directory `<out>` for this run, and run `scripts/fetch-shipped-prs.sh` with
any owners as trailing arguments:

```sh
"<skill-dir>/scripts/fetch-shipped-prs.sh" START END [OWNER...] > <out>/shipped.jsonl; echo "rc=$?"
```

Each line is one PR with `repo`, `number`, `merged`, `title`, `url`,
`issue_links`, `title_ticket_keys`, and the first 400 characters of `body`.

On a non-zero exit, report the script's error and stop: lines already printed
are partial. Do not summarize, list, or group any PR from the partial file, and
do not offer to, even labeled as partial. Exit 64 means a bad date or argument:
fix the call and rerun. After a search-cap error, rerun over shorter ranges and
combine the files. For any other error, such as an HTTP 5xx, tell the user to
rerun once it clears.

## Group and summarize

**Group by product or system, not by repository.** One feature often spans
repositories: a `deploy-service` change, its screen in `web-console`, and its
docs are one item. Name areas after the products in the user's own notes or
the repositories' READMEs when one matches.

Within each area, add bold sub-headers for themes (for example **Rollout
behavior**, **Approvals and UI**). Put refactors, test infrastructure, CI, and
lint fixes under a final **Engineering health** sub-header for that area.

**One sentence per change.** Say what changed for the people who use the
system, in plain words. Merge PRs that ship one change into one line. Collapse
a run of similar PRs into one line with a count ("Cut the complexity of 6
heavily branched methods").

**Drop** version bumps, reverts of work merged in the same window, and PRs
whose only content is fixing the previous PR.

**Links go at the end of each line**, in parentheses, comma-separated: the PRs
first, then the issues.

- PR label: `repo#number`, without the owner.
- Issue label: the ticket key (`OPS-123`), or `repo#number` for a GitHub
  issue.
- Issue source, in order: the title's ticket key, matched to its URL in
  `issue_links`; otherwise the `issue_links` the body cites as the PR's own
  ticket. Skip tickets the body mentions only as related context or follow-up
  work.
- A title key with no URL in `issue_links`: leave it unlinked, unless an issue
  tracker tool available in the session confirms the issue and gives its URL.

## Report

Markdown. This shape is a default to adapt: keep the section order, and fit
the areas, themes, and counts to the work.

```markdown
# Shipped <START> to <END>

## Highlights

- <one sentence>. ([deploy-service#781](…), [web-console#1513](…), [OPS-123](…))
- … 3 to 5 in all

## <Area>

**<Theme>**

- Delayed rollouts now continue one step at a time instead of jumping ahead. ([deploy-service#781](…), [OPS-123](…))

**Engineering health**

- …

## <Next area>

…

## Themes

- 2 to 4 bullets naming patterns across the period, such as "most deploy-service work hardened recovery after incidents".

Left out as personal or trivial: <repos>.
```

- **Highlights** rank by effect on users or the business: new capabilities,
  fixes for incidents or wrong behavior, and automation that removes manual
  work rank above refactors and docs.
- **Areas** are ordered by how much shipped in each.
- **Themes** make only claims the PR list supports.
- The left-out line appears only for a work-only request.

Write plainly: no metaphors, no intensifiers, no "just".

## Brag document

After the report, offer to add the highlights to the user's brag document when
the user names one or one is recorded in their AGENTS.md or memory; otherwise
end with the report. Match the document's existing structure, show the exact
proposed diff, and write only after approval. Add text; never overwrite or
remove existing text.
