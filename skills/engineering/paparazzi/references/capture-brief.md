# Capture brief

How to find an app's surface, bring it up, capture screenshots of it, and record them in a manifest.

## Detection and surface

Determine the project type by inspecting configuration files, then exercise the matching surface. No screenshot requirement applies to nonvisual work.

A UI project is **browser** or **native**. Detect native by project markers: `ios/` holding an `.xcodeproj` or `.xcworkspace`, `android/` holding a `build.gradle` or `gradlew`, a `react-native.config.js`, an `expo` key in `app.json`, or `react-native` / `expo` in the `package.json` dependencies. A bare `app.json` without an `expo` key is not a marker; a project with no marker is browser.

- A **native-only** project enters at build/install/launch and skips HTTP steps 1-4: no HTTP response renders a native app.
- A **marker-matched** project that can also render web keeps the browser steps whenever the screens to capture include a web surface.

## UI Project Verification

Two entry paths, selected in `## Detection and surface`.

**Browser path, steps 1-6**, for a project that renders web:

1. **Start the dev server** (`package.json` scripts, `Makefile`, or equivalent) in the background. Wait until it is ready: "ready" or "listening" output, or a port poll.
2. **Verify the home route.** `curl` the main page: status 200, expected HTML structure, no server-side error messages.
3. **Check the pages to capture.** Verify each route or page you will capture returns successfully.
4. **Check for console errors.** Hit the project's test or health endpoint if it has one. Look for error indicators in the server output.
5. **Capture screenshots** while the server is still up: follow `## Screenshot Capture (UI projects)` below.
6. **Stop the dev server** when capture is complete.

**Native path: build, install, launch.** Run, in order:

1. **Start the JavaScript bundler** for a React Native debug build: Metro serves the JavaScript bundle, so it starts before launch and stops after capture. A project whose app bundles its own JavaScript names that and skips Metro.
2. **Build and install, then reverse the ports, then launch.** Android: `./gradlew :app:installDebug`, then `adb reverse tcp:8081 tcp:8081` (plus any service port the app needs), then `adb shell am start`. iOS: `xcodebuild -scheme <scheme> -destination <destination> build`, then `xcrun simctl install <device> <path-to-app>`, then `xcrun simctl launch <device> <bundle-id>`. Launching before the reverse tunnel renders a Metro connection error, so the reverse step sits between install and launch.
3. **Prerequisites are capability-decides, never version-pinned**: `ANDROID_HOME` / `ANDROID_SDK_ROOT` for the Android SDK, `adb` on PATH, the project's Gradle wrapper, and CocoaPods/Xcode for iOS. A missing prerequisite is reported as a gap, never treated as a failure.
4. **Deadlines.** Device boot has a 120-second bound; the native build has a 600-second bound, or the project's own bound when it names one. Both sit outside the capture budget, which starts when the app is foregrounded.

Then follow `## Screenshot Capture (UI projects)` below, with no dev server.

**Failure handling (both paths).** When a native-only run produces no PNGs because build, boot, or capture failed, record manifest `status: partial` and list each failure under `## Skipped`.

## Screenshot Capture (UI projects)

These rules bind every capture, browser or native.

**Seed.** Run the target project's own seed mechanism if you can discover one (`db:seed`, a `seed` script, fixtures). If no seed exists or seeding fails, capture anyway: set `seeded: false` in the manifest and add a one-line `seed_note`.

**Capture, browser.** Use the Playwright CLI through Bash (for example `npx playwright screenshot`). Take viewport-size shots, not full-page, so each image stays under GitHub's 10MB attachment limit. Capture one PNG per affected page or state, including reproducible empty and error states. Name files `<NN>-<route-slug>-<state>.png`, zero-padded so listing order is stable, and write them to the output directory.

**Locator scope (advisory).** The Playwright CLI cannot run programmatic locators. When the caller drives Playwright through a runner the project already has, scope by role with an exact accessible name, such as `getByRole("checkbox", { name: "Privacy", exact: true })`, and drive a checkbox with `.check()`, which asserts the checked state. A substring match such as `Privacy` also matches `Privacy Policy`, so pass `exact`.

**Capture, native.** Android: `adb exec-out screencap -p > <path>`. iOS: `xcrun simctl io <device> screenshot <path>`. Capture one PNG per affected screen/state, under the caps below.

**Locate and tap (native).** Android can locate a control through the accessibility tree: `adb shell uiautomator dump` writes the tree, then `adb shell input tap <x> <y>` drives it. iOS has no equivalent tree dump, so iOS capture is screenshot-only and programmatic interaction is deferred.

**Device shutdown.** Shut down only the simulator or emulator this run booted: `xcrun simctl shutdown <device>`, `adb emu kill`. A device another process already booted stays running.

**Data caution.** These images can leave the machine when a caller uploads them. Do not capture routes or states that render secrets or real PII. Prefer seeded or synthetic data. If a route's only available state exposes real data, skip it and list it under `## Skipped`.

**Caps and skip statuses.**

- At most 10 shots per run, within a 5-minute total run budget and a 30s per-shot timeout (on timeout, skip that shot, record it under `## Skipped`, and continue).
- Server never started → manifest `status: skipped-server-start`, reported as the first line of the result.
- Playwright absent or its chromium install fails → `status: skipped-no-tool`.
- Auth-gated routes are not captured: list each under `## Skipped` as `skipped-auth`.
- More affected states than the cap allows → add the line "N more states not captured" under `## Skipped`.

**Manifest.** Write `manifest.md` in the output directory through a Bash heredoc with a **quoted delimiter** (`<<'EOF'`), so caption and `seed_note` text can never trigger `$()`/backtick expansion. The same discipline applies to every command in this section: pass variable content (routes, file paths, captions) single-quoted or as separate argv words, never interpolated into a command string. Frontmatter schema, exactly:

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
