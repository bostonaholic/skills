---
name: prototyping-ui
description: Builds 3 to 5 interactive HTML, CSS, and JavaScript prototypes of one feature, each a different interaction model, then compares their usability as an experienced UX designer and recommends one. Use when the user says "prototype this", or asks to prototype, mock up, or compare design options for a screen, flow, or component. Not for building the production feature.
---

# Prototyping UI

Build several working prototypes of the same feature so the user can compare
them by using them, then give a UX designer's judgment on which works best and
why.

## Rules

- **Different models, not different skins.** Each variant tests a distinct
  hypothesis about how the user does the task: a wizard against a single
  form, inline editing against a modal, search-first against browse-first.
  Two variants that differ only in color, spacing, or copy count as one.
- **Same task, same data.** Every variant does the same core task with the
  same realistic content, so differences come from the design. Use plausible
  data drawn from the repository when it has any, never lorem ipsum.
- **Interactive, not static.** The core task works end to end: inputs change
  state, buttons do something, and validation, empty, and error states
  appear where the task has them. A control that does nothing is labeled as
  out of scope on screen.
- **Self-contained.** One HTML file per variant with inline CSS and
  JavaScript, no build step, no framework, and no network request: no CDN,
  font, or image URL. Each file opens from disk.
- **Accessible by default.** Semantic elements, labeled inputs, a visible
  focus ring, keyboard operation of the core task, and text contrast of at
  least 4.5:1. A variant that fails these cannot be recommended.
- **Opinion, not data.** The comparison is expert review against usability
  heuristics, not user testing. Say so, and name what a real test with
  users should check.

## Steps

1. Pin the brief: who uses this, the one core task, and the constraints
   (device, existing design system, brand). Take them from the request and
   the repository. Ask one question only when the core task is unknown;
   otherwise state the assumptions and go.
2. Choose the variants: 3 by default, up to 5 when the design space is wide.
   Write one line per variant naming its interaction model and the
   hypothesis it tests. Drop any variant that repeats another's model.
3. Write the files under `prototypes/<topic>/`, or the repository's existing
   prototype directory:
   - `<n>-<model>.html` for each variant.
   - `index.html`: links to every variant, each with its one-line
     hypothesis, plus the scenario to try in all of them.
   - When the repository has a design system, reuse its tokens (colors,
     type scale, spacing) copied inline, so the comparison is about
     interaction rather than looks.
4. Check every variant before reporting. When a browser tool is available,
   open each file, complete the core task with the keyboard and the mouse,
   and read the console. Otherwise reread each file for dead handlers,
   missing states, and network URLs. Fix what fails and check again until
   every variant completes the task with no console error.
5. Report in this shape, adapting the wording:
   - The path to `index.html` and the scenario to try.
   - A table with one row per variant: interaction model, strongest point,
     main usability risk, and the heuristics it serves or breaks (such as
     visibility of status, error prevention, recognition over recall).
   - The recommendation: one variant, or a named hybrid, with the reasons,
     the trade-off it accepts, and a confidence of high, moderate, or low.
   - What to test with real users to confirm it, as two or three task-based
     questions.
