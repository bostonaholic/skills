# Shot list

The input to `scripts/shoot.mjs`. One `origin` (it may carry a base path);
each shot writes `<name>.png`. `defaults` below are the values used when it is
omitted.

```json
{
  "origin": "http://127.0.0.1:4100",
  "defaults": { "viewport": { "width": 1280, "height": 800 }, "deviceScaleFactor": 2, "colorScheme": "light", "locale": "en-US", "timezoneId": "UTC" },
  "shots": [
    { "name": "01-pricing-populated", "path": "/pricing", "fullPage": true, "hide": ["#cookie-banner"] },
    {
      "name": "02-settings-populated-edit",
      "path": "/settings",
      "actions": [{ "click": { "role": "button", "name": "Edit profile" } }, { "fill": { "label": "Name" }, "value": "Ada Lovelace" }, { "press": "Tab" }],
      "waitFor": { "text": "Unsaved changes" },
      "target": { "testId": "profile-card" },
      "mask": [".last-seen"]
    }
  ]
}
```

| Field                                                                  | Meaning                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `name`                                                                 | `NN-route-slug-state` plus interaction or variant words, lowercase                 |
| `path`                                                                 | Starts with `/`; appended to the origin                                            |
| `actions`                                                              | In order: `click`, `hover`, `check`, `scroll`, `fill` (+ `value`), `press` (a key) |
| `waitFor`                                                              | A locator that must be visible first: the proof the state was reached              |
| `target`                                                               | Crop to this element plus 16 CSS px of context                                     |
| `fullPage`                                                             | The whole scrollable page; excludes `target`                                       |
| `mask`                                                                 | Locators painted gray (content that changes between runs)                          |
| `hide`                                                                 | Locators made invisible (banners, dev badges, toasts over the subject)             |
| `expectStatus`                                                         | Status an intended error page returns; otherwise 400 or more fails the frame       |
| `viewport`, `deviceScaleFactor`, `colorScheme`, `locale`, `timezoneId` | Per-shot override; scale factor 1 to 3                                             |

A locator is a CSS selector string or one of `{"role", "name"}`, `{"text"}`,
`{"label"}`, `{"testId"}`. Names, text, and labels match exactly, so
`Privacy` never matches `Privacy Policy`; an exact name can miss a heading
with a nested anchor link, so fall back to its `id`. Prefer role or label to
CSS. Use `check` for checkboxes, since it asserts the checked state.
