---
name: drawing-mermaid-diagrams
description: Writes, edits, and debugs Mermaid diagrams (flowchart, sequence, class, state, ER, Gantt, pie, mindmap, timeline, quadrant, git graph, XY, Sankey, architecture, journey, kanban, block). Use when the user asks for a diagram, flowchart, ERD, or Mermaid code, or when a Mermaid diagram fails to parse or render.
---

# Mermaid Diagrams

A diagram is done when it renders without error and its layout reads clearly.
Pick the type that matches the content (process, messages, schema, schedule,
hierarchy, and so on); a `flowchart` is not the answer to everything.

## Renderer support

Each host (GitHub, GitLab, a docs site, an IDE preview) bundles its own Mermaid
release, often older than the latest. `-beta` keywords (`xychart-beta`,
`sankey-beta`, `architecture-beta`, `block-beta`) and recent types such as
`kanban` may fail there. When the target renderer is unknown, prefer a core
type, or ask which renderer will display the diagram.

Default to a frontmatter `config:` block before the diagram keyword. Fall back
to a first-line `%%{init: {...}}%%` directive only for a renderer too old to
read frontmatter config.

## Validate by rendering

Write the diagram to `<out>/diagram.mmd` in a scratch directory and render it:

```sh
npx -y @mermaid-js/mermaid-cli -i <out>/diagram.mmd -o <out>/diagram.png
```

For a Markdown file, `-i doc.md -o <out>/doc.md` renders every mermaid block.
Fix each `Parse error on line N` or `Lexical error` and render again until it
succeeds. When layout matters, open the PNG and check direction, overlaps, and
label text. Only then put the code in its destination.

If `mmdc` cannot find Chrome, write
`{"executablePath": "<path to an installed Chrome or Chromium>"}` to
`<out>/puppeteer.json` and add `-p <out>/puppeteer.json`. If Node, network, or
a browser is unavailable, do not install one without asking; check the diagram
against the gotchas below and tell the user it was not rendered.

A successful CLI render uses the Mermaid release bundled with the CLI, so it
does not prove an older host renders the diagram.

## Gotchas

Several of these fail silently rather than with a parse error.

- Labels containing `()`, `[]`, `{}`, `:`, `;`, or `#` are wrapped in
  `"..."`; inner quotes are written `#quot;`, `<` and `>` as `#lt;` and `#gt;`.
- A lowercase `end` as a flowchart node ID or bare label breaks the parse; use
  `End` or `["end"]`.
- A node ID beginning with `o` or `x` right after a link (`A---oB`) silently
  becomes a circle or cross edge; add a space or capitalize.
- `%%` comments sit on their own line; a trailing comment is a parse error.
- Block diagrams have no `==>` or `:::` shorthand.
- Indentation is significant in `mindmap` and `kanban`.
- Styling not applying: the config block must come first, `themeVariables`
  need `theme: base`, and hex colors in frontmatter must be quoted (an unquoted
  `#` is a YAML comment and the color is silently dropped).
- Renders in the CLI but not on the host: the host's Mermaid is older; replace
  a `-beta` or recent type, or switch frontmatter config to `%%{init}`.
