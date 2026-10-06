---
name: drawing-mermaid-diagrams
description: Writes, edits, and debugs Mermaid diagrams (flowchart, sequence, class, state, ER, Gantt, pie, mindmap, timeline, quadrant, git graph, XY, Sankey, architecture, journey, kanban, block). Use when the user asks for a diagram, flowchart, ERD, or Mermaid code, or when a Mermaid diagram fails to parse or render.
---

# Mermaid Diagrams

## Choose the type

Pick the row that matches the need, then read its reference before drafting.

| Need                                 | Keyword             | Reference                                                |
| ------------------------------------ | ------------------- | -------------------------------------------------------- |
| Process steps, decision trees        | `flowchart`         | [flowcharts](references/flowcharts.md)                   |
| Messages between services or actors  | `sequenceDiagram`   | [sequence](references/sequence.md)                       |
| Classes, interfaces, relationships   | `classDiagram`      | [class](references/class.md)                             |
| State machines, lifecycles           | `stateDiagram-v2`   | [state](references/state.md)                             |
| Database tables and keys             | `erDiagram`         | [entity-relationship](references/entity-relationship.md) |
| Project schedule, dependencies       | `gantt`             | [gantt](references/gantt.md)                             |
| Proportions                          | `pie`               | [pie](references/pie.md)                                 |
| Idea hierarchy                       | `mindmap`           | [mindmap](references/mindmap.md)                         |
| Dated events                         | `timeline`          | [timeline](references/timeline.md)                       |
| Two-axis prioritization              | `quadrantChart`     | [quadrant](references/quadrant.md)                       |
| Branches, merges, tags               | `gitGraph`          | [gitgraph](references/gitgraph.md)                       |
| Bar or line chart                    | `xychart-beta`      | [xychart](references/xychart.md)                         |
| Quantities flowing between nodes     | `sankey-beta`       | [sankey](references/sankey.md)                           |
| Cloud or service topology with icons | `architecture-beta` | [architecture](references/architecture.md)               |
| User experience steps with scores    | `journey`           | [journey](references/journey.md)                         |
| Task board columns                   | `kanban`            | [kanban](references/kanban.md)                           |
| Fixed grid layout placed by hand     | `block-beta`        | [block](references/block.md)                             |

Read [styling](references/styling.md) when setting a theme, colors, fonts, or
diagram configuration.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

### Renderer support

Each host (GitHub, GitLab, a docs site, an IDE preview) bundles its own Mermaid
release, often older than the one in these references. `-beta` keywords and
recently added types such as `kanban` and `architecture-beta` may fail there.
When the target renderer is unknown, prefer a core type, or ask which renderer
will display the diagram.

## Configuration

Default to a frontmatter `config:` block before the diagram keyword. Fall back
to a first-line `%%{init: {...}}%%` directive only for a renderer too old to
read frontmatter config. [styling](references/styling.md) shows both.

## Workflow

1. Choose the type and read its reference.
2. Write the diagram to `<out>/diagram.mmd`, where `<out>` is a scratch
   directory.
3. Render it:

   ```sh
   npx -y @mermaid-js/mermaid-cli -i <out>/diagram.mmd -o <out>/diagram.png
   ```

   For a Markdown file, `-i doc.md -o <out>/doc.md` renders every mermaid
   block.

4. On `Parse error on line N` or `Lexical error`, fix that line using the
   debugging checklist below and render again. Repeat until the render
   succeeds.
5. When layout matters, open the PNG and check direction, overlaps, and label
   text. Adjust and re-render.
6. Put the validated code in its destination.

If `mmdc` reports that it could not find Chrome, write
`{"executablePath": "<path to an installed Chrome or Chromium>"}` to
`<out>/puppeteer.json` and add `-p <out>/puppeteer.json`. If Node, network, or
a browser is unavailable, do not install one without asking; check the diagram
against the debugging checklist instead and tell the user it was not rendered.

A successful render uses the Mermaid release bundled with the CLI, so it does
not prove an older host renders the diagram (see Renderer support).

## Debugging checklist

- The first line, after any frontmatter, is the diagram keyword.
- Brackets and quotes balance in every node definition.
- Arrows match the type: flowchart `-->`, sequence `->>`, class `<|--`, ER
  `||--o{`. Block diagrams have no `==>` or `:::` shorthand.
- Labels containing `()`, `[]`, `{}`, `:`, `;`, or `#` are wrapped in
  `"..."`; inner quotes are written `#quot;`, `<` and `>` as `#lt;` and `#gt;`.
- A lowercase `end` as a flowchart node ID or bare label breaks the parse; use
  `End` or `["end"]`.
- A node ID beginning with `o` or `x` right after a link (`A---oB`) silently
  becomes a circle or cross edge; add a space or capitalize.
- `%%` comments sit on their own line; a trailing comment is a parse error.
- Indentation is significant in `mindmap` and `kanban`.
- Styling not applying: the config block must come first, `themeVariables`
  need `theme: base`, and hex colors in frontmatter must be quoted (an unquoted
  `#` is a YAML comment and the color is silently dropped).
- Renders in the CLI but not on the host: the host's Mermaid is older; replace
  a `-beta` or recent type, or switch frontmatter config to `%%{init}`.

## Find syntax in the references

```sh
grep -rn -e '-->' -e '==>' -e '-\.->' <skill-dir>/references/
grep -rn -e 'classDef' -e 'themeVariables' -e 'config:' <skill-dir>/references/
```
