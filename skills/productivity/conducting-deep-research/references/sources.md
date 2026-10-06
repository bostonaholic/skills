# Source discovery and evaluation

Search broadly for discovery, then cite the exact paper, dataset, award, filing,
or official program page that supports the claim. Search results, snippets, and
AI answers are leads, not evidence.

## Research lanes

### Scholarly literature

Use scholarly indexes and field-specific repositories to find recent syntheses,
foundational work, original studies, replications, and contrary results. Follow
useful references backward and citing papers forward. Prefer the publisher,
proceedings, preprint server, author manuscript, or DOI record over a secondary
summary.

For each paper record:

- citation, direct URL or DOI, venue, year, and peer-review status;
- research question, study design, data or sample, and comparator;
- result, effect size or uncertainty when reported, and authors' limitations;
- funding acknowledgements, author conflicts, corrections, and retractions;
- relevance to the user's goal and confidence in that relevance.

Do not rank evidence from citation counts alone. Treat preprints as provisional
and label them. For fast-moving topics, include recent preprints when relevant,
but compare them with reviewed or independently replicated work.

### Research institutions and public funders

Search official university and institute publications, government research
agencies, national laboratories, grant databases, trial registries, standards
bodies, and program award pages. Separate work an organization performed from
work it funded. Record the program, recipient, amount, dates, and research
objective when the primary source states them; write `not disclosed` rather
than estimating missing terms.

### Large companies

Identify companies active in the specific field before searching their research
portals, papers, grant or fellowship programs, trial registrations, annual
reports, financial filings, and official funding announcements. Verify whether
the company performed, published, sponsored, or funded the work. For a funding
claim, prefer an award record, filing, paper acknowledgement, recipient
announcement, or official program page over a marketing article. When no result
is found, write `funded; no public result identified as of <date>`; claim that
results are unpublished only when a source confirms it.

Do not assume an organization is a funder because its staff coauthored a paper.
Do not call an organization a major funder without evidence of scale relevant
to the topic.

## Evidence record

Return one compact record per source with exactly these fields, so the lead
model can reconcile records across lanes:

```text
Claim:
Citation and link:
Source role: performed by | published by | funded by | sponsored by
Publication status:
Method and data:
Finding and uncertainty:
Limitations and conflicts:
Relevance to goal:
Confidence: high | medium | low, with reason
```

Secondary reporting may supply context or reveal a source. Trace material
claims to a primary source when possible; when impossible, label the secondary
evidence and explain the limitation. Seek evidence that could disconfirm the
leading conclusion, not only additional support for it.
