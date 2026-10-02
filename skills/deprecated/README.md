# Deprecated

Archived skills kept for reference. They are excluded from the active catalog and plugin.
Entrypoints use `SKILL.md.disabled` so recursive skill installers do not discover them.
Their shared files are frozen copies and are not updated by `sync-shared`.

- [pr-cleanup](pr-cleanup/SKILL.md.disabled): retired standalone post-PR cleanup. Its original teardown declaration and variables are preserved in the archive.

To reactivate a skill, move it to `skills/<name>/`, rename `SKILL.md.disabled` to `SKILL.md`, update the plugin manifest, and regenerate shared copies and the catalog.
