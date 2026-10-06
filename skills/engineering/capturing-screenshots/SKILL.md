---
name: capturing-screenshots
description: Captures deterministic, visually verified screenshots of a running web or native app (named screens, states, viewports, dark mode) with a manifest. Use when asked for screenshots of an app or its screens. Not for attaching images to a PR; use attaching-pr-screenshots.
effort: high
argument-hint: "[--out <dir>] [--url <app-url>] [<what to shoot>]"
---

# capturing-screenshots — screenshots you can trust

The caller names what to shoot and decides what the frames are for. This skill
photographs those screens as the app runs now and proves every frame shows what
its caption claims.

A **shot** is one entry in the shot list; a **frame** is the PNG a shot
produces. The output is frames plus a `manifest.md` in the schema of the
[capture brief](references/capture-brief.md#screenshot-capture-ui-projects).
Frames are deterministic, so a caller that shoots the same shot list against
another version of the app gets comparable frames. Doing that is the caller's
choice, not this skill's.

## Arguments

| Argument          | Default                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `--out <dir>`     | `$(mktemp -d)/screenshots`                                                       |
| `--url <app-url>` | Start the app from the checkout. With a URL, shoot the app already running there |
| Free text         | The screens, states, elements, and variants to shoot                             |

## Requirements

Check only the tools of each path the run takes; the
[capture brief](references/capture-brief.md) detects browser or native.

- **Browser:** `command -v node npm jq`. `node` runs the scripts, `npm`
  installs Playwright when needed, and `jq` writes the shot list.
- **Native:** `command -v node` for `scripts/png-check.mjs`, plus `adb` for
  Android or `xcrun` for iOS.

A missing tool is `status: skipped-no-tool`, reported with the tool's name.
When no Playwright resolves, [stage and shoot](references/shoot.md) step 1
installs `playwright@1` and Chromium from the network into a user cache; say
so before it runs, and name the install in the report.

## Bounds

These are the only caps; every reference defers to them.

- **Shots:** at most 10 per run unless the caller names more. Past the cap,
  keep the most informative shots and record `N more states not captured`
  under the manifest's `## Skipped`.
- **Time:** `scripts/shoot.mjs` fails any page operation in a shot that takes
  over 30 seconds. The whole capture stays within 5 minutes from the moment
  the app is ready; when it runs out, skip the remaining shots with that
  reason. Native build and device boot deadlines sit outside it, per the
  capture brief.
- **Retakes:** a failed shot is retaken at most once with a changed spec, then
  skipped with its reason.
- **Size:** `scripts/png-check.mjs` fails a frame over GitHub's 10 MB image
  attachment limit.

## Hard rules

- **Shoot what the caller asked for.** The caller names the screens. When a
  name matches no screen or more than one, or nothing is named, ask one
  question rather than guess.
- **Frames are deterministic.** Reduced motion, frozen animations, a hidden
  caret, loaded fonts and in-view images, an idle network or a report that it
  never idled, and masked volatile content. Never `sleep` in place of a wait
  condition.
- **Every frame is looked at.** The scripts' gates run first, then each image
  is opened and checked against its caption. An unviewed frame is reported as
  not visually verified, never as captured-and-checked.
- **A frame shows what it claims.** It shows its named screen and state, with
  nothing obscuring or faking it. Never caption around a defect.
- **Capture only.** Start and stop app servers, and write only to `--out` and
  a temporary directory. Never commit, push, edit a PR, or change git state.
  Teardown stops every server this run started, by PID, even after a failure.
- **Nothing sensitive is framed.** Apply the brief's data caution: seeded or
  synthetic data, mask what cannot be avoided, skip what cannot be masked.
- **Degrade, never block.** No browser is `status: skipped-no-tool`. An app
  that will not start is `status: skipped-server-start`. Each degradation gets
  its own report line.

## Procedure

Seed one todo per numbered step of the reference you are in.

1. [Plan the shots](references/plan.md): the targets, the states and
   variants, the framing, and the shot-list schema.
2. [Stage and shoot](references/shoot.md): the tools, the app, seeding,
   `scripts/shoot.mjs`, native capture, and teardown.
3. [Verify and report](references/verify.md): the gates, the look, the
   manifest, and the report.

Read the [capture brief](references/capture-brief.md) when a step cites it:
project detection, starting the app, the native path, seeding, data caution,
and the manifest schema.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## Applied principles

- Before writing the shot list or reading page output, read
  [external data rules](shared/external-data.md).
- Before step 1, read [execution rules](shared/execution.md) for loop bounds
  and progress tracking.
- When delegating any step, read [focused work rules](shared/focused-work.md).
- Before the report, read [verified results rules](shared/verified-results.md).
