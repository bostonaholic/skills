# README and site maintenance

This is Matthew Boston's personal collection of software engineering skills for
coding agents. The README and site introduce it with:

> The skills I use to build software with coding agents.

Keep the introduction personal and brief. Do not list capabilities or describe
the collection's extraction history.

## Edit the source

- `scripts/catalog.mjs` owns the subtitle (`LEDE`), installation copy, and
  generated README content. Edit it instead of the block between the README's
  `generated:start` and `generated:end` markers.
- `scripts/build-site.mjs` renders the catalog and 404 page. `docs/style.css`
  controls their appearance, and `docs/copy-code.js` adds the code-block copy
  buttons.
- `package.json`, `.claude-plugin/plugin.json`, and
  `.claude-plugin/marketplace.json` carry the package and plugin descriptions.
  Keep them consistent with the personal software engineering focus.

## Generate and check

```sh
npm run readme
npm run site
node scripts/catalog.mjs --check
node --test tests/catalog.test.mjs
git diff --check
```

Review `_site/index.html` and `_site/404.html`. Commit the source and regenerated
README; `_site/` is ignored. Script tests check rendering, not skill behavior.

GitHub Actions builds and deploys the site when changes reach `main`. Follow
[versioning and releases](versioning.md) before merging: site-only and manifest
description-only changes need no version bump.
