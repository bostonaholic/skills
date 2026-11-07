<!-- Canonical file: shared/verified-results.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Verified results

- An exit code proves the command was accepted, not the resulting state. Re-query the authoritative state before claiming a mutation succeeded.
- Reviewer or model agreement is corroboration, never proof.
- For a dependency compatibility claim, load the lowest admitted version and call the API. A version range or changelog proves nothing.
- No PASS without cited evidence. Report each skipped check or unavailable capability on its own line with the reason.
- Use `unverified` or `captured, not yet uploaded` for incomplete work, never success wording.
