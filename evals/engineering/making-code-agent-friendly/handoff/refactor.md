Refactor this billing service so parallel changes stop colliding. Today every
new event edits the `handlers` array in `src/handlers/index.js` and the
`switch` in `src/events/router.js`, and every schema change takes the next
global migration number. Two people who each add an event edit the same lines
and pick the same migration number.

Change the structure so that a new handler, a new route, or a new migration is
a new file, with no edit to a shared list.

- Keep the three exports and their behavior: `dispatch(event)` in
  `src/handlers/index.js`, `queueFor(eventType)` in `src/events/router.js`,
  and `listMigrations(dir)` in `src/migrations.js`, including its rejection of
  two migrations that share a version.
- Keep the existing migration file names.
- Keep `npm test` passing.
- Update the "how to add" text in `README.md` to match the new structure.
- Add no feature, and make no commit.

Tests run with file access inside the repository only, and with no child
processes.
