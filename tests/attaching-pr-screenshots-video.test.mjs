// Fails when attaching-pr-screenshots stops rendering a supported video as its
// bare attachment URL, stops counting that URL in the splice, or stops matching
// the read-back <video> element by asset id.
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/attaching-pr-screenshots/scripts");
const { splice, bodyRefusal } = await import(join(SCRIPTS, "splice.mjs"));
const { renderSection, pairEntries } = await import(join(SCRIPTS, "write-body.mjs"));
const { verifySection } = await import(join(SCRIPTS, "write-result.mjs"));

const IMG = "https://github.com/user-attachments/assets/11111111-aaaa-bbbb-cccc-000000000001";
const VID = "https://github.com/user-attachments/assets/22222222-aaaa-bbbb-cccc-000000000002";
const entries = [
  { path: "/r/a.png", caption: "login" },
  { path: "/r/b.mp4", caption: "flow", state: "demo" },
];
const body = "## Summary\n\nThing.\n\n## Test plan\n\n- x\n";
const fixtures = {
  image: {
    entries: [entries[0]],
    assets: `${IMG}\t/r/a.png\n`,
    kinds: `image\t/r/a.png\n`,
  },
  video: {
    entries: [entries[1]],
    assets: `${VID}\t/r/b.mp4\n`,
    kinds: `video\t/r/b.mp4\n`,
  },
  mixed: {
    entries,
    assets: `${IMG}\t/r/a.png\n${VID}\t/r/b.mp4\n`,
    kinds: `image\t/r/a.png\nvideo\t/r/b.mp4\n`,
  },
};
const html = {
  image: `<h2>Screenshots</h2><p><strong>login</strong><br><img alt="screenshot-01" src="${IMG}"></p>`,
  video: `<h2>Screenshots</h2><p><strong>flow</strong> (demo)</p><video src="${VID}" data-canonical-src="${VID}" controls="controls" muted="muted"></video>`,
};
html.mixed = html.image + html.video.replace("<h2>Screenshots</h2>", "");

for (const [kind, fixture] of Object.entries(fixtures)) {
  const paired = pairEntries(fixture.entries, fixture.assets, "", fixture.kinds);
  const section = renderSection(paired);

  test(`${kind}: render`, () => {
    if (kind !== "image")
      assert.match(section, new RegExp(`\\*\\*flow\\*\\* \\(demo\\)\\n\\n${VID}\\n`));
    if (kind !== "video") assert.match(section, /\*\*login\*\*\n!\[screenshot-01\]\(/);
  });

  const spliced = splice(body, section, { landed: paired.length });
  test(`${kind}: splice`, () => {
    assert.equal(spliced.changed, true, spliced.reason);
    assert.equal(bodyRefusal(spliced.body), "");
  });

  test(`${kind}: idempotent rerun refuses unchanged`, () => {
    const again = splice(spliced.body, section, { landed: paired.length });
    assert.equal(again.changed, false);
    assert.match(again.reason, /already carries/);
  });

  test(`${kind}: landed guard`, () => {
    assert.equal(splice(body, section, { landed: paired.length - 1 }).changed, false);
  });

  test(`${kind}: verify passes`, () => {
    assert.equal(verifySection(html[kind], paired, "github.com"), "");
  });

  test(`${kind}: verify fails w/o element`, () => {
    assert.notEqual(verifySection("<h2>Screenshots</h2><p>x</p>", paired, "github.com"), "");
  });
}

const mixed = pairEntries(fixtures.mixed.entries, fixtures.mixed.assets, "", fixtures.mixed.kinds);

test("off-origin video refused", () => {
  assert.match(
    verifySection(`${html.mixed}<video src="https://evil.example/x.mp4">`, mixed, "github.com"),
    /not on the attachment origin/,
  );
});

test("no kinds file = images (back-compat)", () => {
  assert.equal(
    pairEntries(fixtures.image.entries, fixtures.image.assets, "").map((item) => item.kind)[0],
    "image",
  );
});

test("kinds mismatch throws", () => {
  assert.throws(() => pairEntries(entries, fixtures.mixed.assets, "", "video\t/r/a.png\n"));
});

test("bare URL outside section still refused", () => {
  assert.match(bodyRefusal(`${body}\n${VID}\n`), /bare auto-embedded/);
});

test("bare URL under reviewer prose refused", () => {
  assert.notEqual(bodyRefusal(`## Screenshots\n\nreviewer said\n${VID}\n`), "");
});

test("replace shrinking video count refused", () => {
  const big = splice(body, renderSection(mixed), { landed: 2 }).body;
  const imageOnly = pairEntries(
    fixtures.image.entries,
    fixtures.image.assets,
    "",
    fixtures.image.kinds,
  );
  const result = splice(big, renderSection(imageOnly), { landed: 1 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /screenshot references/);
});

test("video URL non-attachment rejected by renderer", () => {
  assert.throws(() =>
    renderSection([
      { entry: entries[1], status: "landed", url: "https://github.com/x/y", kind: "video" },
    ]),
  );
});

test("caption-injected URL in section refused", () => {
  const section = `## Screenshots\n\n**a**\n\n${VID}\n`;
  assert.equal(splice(body, section, { landed: 0 }).changed, false);
});

test("legacy image-only section still replaced cleanly", () => {
  const old = splice(
    body,
    renderSection(pairEntries(fixtures.image.entries, fixtures.image.assets, "")),
    { landed: 1 },
  ).body;
  assert.equal(splice(old, renderSection(mixed), { landed: 2 }).changed, true);
});

test("caption-adjacent URL (same paragraph) not owned", () => {
  assert.match(bodyRefusal(`## Screenshots\n\n**a**\n${VID}\n`), /bare auto-embedded/);
});

test("private proxy video src matched by asset id", () => {
  const paired = pairEntries(
    fixtures.video.entries,
    fixtures.video.assets,
    "",
    fixtures.video.kinds,
  );
  assert.equal(
    verifySection(
      `<h2>Screenshots</h2><details><video src="https://private-user-images.githubusercontent.com/362146/685364136-22222222-aaaa-bbbb-cccc-000000000002.mp4?jwt=abc"></video></details>`,
      paired,
      "github.com",
    ),
    "",
  );
});

test("missing video element fails", () => {
  const paired = pairEntries(
    fixtures.video.entries,
    fixtures.video.assets,
    "",
    fixtures.video.kinds,
  );
  assert.equal(
    verifySection(`<h2>Screenshots</h2><p>none</p>`, paired, "github.com"),
    "video 1 has no rendered video element",
  );
});
