# Capture brief

How to find an app's surface, bring it up, capture screenshots of it, and record them in a manifest.

## Detection and surface

Determine the project type by inspecting configuration files, then exercise the matching surface. No screenshot requirement applies to nonvisual work.

A UI project is **browser** or **native**. Detect native by project markers: `ios/` holding an `.xcodeproj` or `.xcworkspace`, `android/` holding a `build.gradle` or `gradlew`, a `react-native.config.js`, an `expo` key in `app.json`, or `react-native` / `expo` in the `package.json` dependencies. A bare `app.json` without an `expo` key is not a marker; a project with no marker is browser.

- A **native-only** project enters at build/install/launch and skips the browser path: no HTTP response renders a native app.
- A **marker-matched** project that can also render web keeps the browser steps whenever the screens to capture include a web surface.

## UI Project Verification

Two entry paths, selected in `## Detection and surface`.

**Browser path**, for a project that renders web:

1. **Start the dev server** (`package.json` scripts, `Makefile`, or equivalent) in the background. Wait until it is ready: "ready" or "listening" output, or a port poll.
2. **Verify the home route.** `curl` the main page: status 200, expected HTML structure, no server-side error messages.
3. **Capture** while the server is still up, following `## Screenshot Capture (UI projects)` below. `scripts/shoot.mjs` checks each page's HTTP status and records its console errors, page errors, and failed requests.
4. **Stop the dev server** when capture is complete.

**Native path: build, install, launch.** Run, in order:

1. **Start the JavaScript bundler** for a React Native debug build: Metro serves the JavaScript bundle, so it starts before launch and stops after capture. A project whose app bundles its own JavaScript names that and skips Metro.
2. **Build and install, then reverse the ports, then launch.** Android: `./gradlew :app:installDebug`, then `adb reverse tcp:8081 tcp:8081` (plus any service port the app needs), then `adb shell am start`. iOS: `xcodebuild -scheme <scheme> -destination <destination> build`, then `xcrun simctl install <device> <path-to-app>`, then `xcrun simctl launch <device> <bundle-id>`. Launching before the reverse tunnel renders a Metro connection error, so the reverse step sits between install and launch.
3. **Prerequisites are capability-decides, never version-pinned**: `ANDROID_HOME` / `ANDROID_SDK_ROOT` for the Android SDK, `adb` on PATH, the project's Gradle wrapper, and CocoaPods/Xcode for iOS. A missing prerequisite is reported as a gap, never treated as a failure.
4. **Deadlines.** Device boot has a 120-second bound; the native build has a 600-second bound, or the project's own bound when it names one. Both sit outside the skill's capture time bound, which starts when the app is foregrounded.

Then follow `## Screenshot Capture (UI projects)` below, with no dev server.

**Failure handling (both paths).** When a native-only run produces no PNGs because build, boot, or capture failed, record manifest `status: partial` and list each failure under `## Skipped`.

## Screenshot Capture (UI projects)

These rules bind every capture, browser or native.

**Seed.** Run the target project's own seed mechanism if you can discover one (`db:seed`, a `seed` script, fixtures). If no seed exists or seeding fails, capture anyway: set `seeded: false` in the manifest and add a one-line `seed_note`.

**Capture, browser.** Run `scripts/shoot.mjs` on a shot list, as [stage and shoot](references/shoot.md) describes. It takes viewport, full-page, and element frames, runs exact-match locators and actions, and falls back to an installed Google Chrome when bundled Chromium will not launch. `scripts/png-check.mjs` gates each frame's size. Capture one frame per affected page or state, including reproducible empty and error states. Name files `<NN>-<route-slug>-<state>.png`, zero-padded so listing order is stable.

**Capture, native.** Android: `adb exec-out screencap -p > <path>`. iOS: `xcrun simctl io <device> screenshot <path>`. Capture one frame per affected screen or state, within the skill's [bounds](SKILL.md#bounds).

**Locate and tap (native).** Android can locate a control through the accessibility tree: `adb shell uiautomator dump` writes the tree, then `adb shell input tap <x> <y>` drives it. iOS has no equivalent tree dump, so iOS capture is screenshot-only, with no programmatic interaction.

**Device shutdown.** Shut down only the simulator or emulator this run booted: `xcrun simctl shutdown <device>`, `adb emu kill`. A device another process already booted stays running.

**Data caution.** These images can leave the machine when a caller uploads them. Do not capture routes or states that render secrets or real PII. Prefer seeded or synthetic data. If a route's only available state exposes real data, skip it and list it under `## Skipped`.

**Skip statuses.** The caps themselves are the skill's [bounds](SKILL.md#bounds).

- Server never started → manifest `status: skipped-server-start`, reported as the first line of the result.
- No Playwright, or no browser launches (`shoot.mjs` exit 3) → `status: skipped-no-tool`.
- Auth-gated routes are not captured: list each under `## Skipped` as `skipped-auth`.
- A shot that times out or fails its retake → list it under `## Skipped` with its reason, and continue.

**Manifest.** Write `manifest.md` in the output directory with the file-writing tool, never through a shell heredoc or `echo`, so caption and `seed_note` text never pass through a shell. Frontmatter schema, exactly:

```yaml
---
topic: <topic>        # the caller's subject
date: <YYYY-MM-DD>
status: captured | partial | skipped-server-start | skipped-no-tool
seeded: true | false
seed_note: <one line when seeding was absent or failed; omitted otherwise>
---
```

Body: a `## Captured` section with one `### <NN>-<route-slug>-<state>.png` heading per shot carrying three bullets, `route:` (the URL path), `state:` (populated | empty | error), and `caption:` (one sentence), and a `## Skipped` section listing each skipped route/state with its reason. `status: captured` means every planned shot is present. `partial` means some were skipped.
