<!-- Canonical file: shared/durable-state.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Durable state

Consumers read the artifact file, not a producer's summary of it. Write each required artifact before reporting completion. Append verdict records; never replace earlier ones.

## Repeatable mutations

- Match existing titles or content before creating. Treat an already-closed or already-deleted target as done.
- Re-read each item immediately before writing and compare it with its captured pre-image. On drift, skip and report it instead of overwriting.
- Before a destructive write, capture the untouched pre-image and a recovery anchor. No pre-image, no destructive write.
- A baseline check that could not run is UNKNOWN and proves no preservation.
- Report the recovery anchor on success and on failure, including any applicable `git reset --hard <sha>`.
