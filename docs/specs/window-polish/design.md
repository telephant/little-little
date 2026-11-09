# Window polish — design

Read with `spec.md` §4–6. Diagrams: `diagrams/index.html` (from `diagrams/diagrams.md`). Exact values, CSS and test
approach: `design-detail.md` (reference only).

Frontend and config only. **No Rust, IPC, schema or ADR change.** Everything here is reversible configuration
(`tauri.conf.json`, one capability file) plus presentation (top bar, calendar layout).

## Components

| ID | Component | Job | Notes |
|----|-----------|-----|-------|
| C-1 | Window config (`src-tauri/tauri.conf.json`) | 1100x760, min 900x620, centred, Overlay title bar, hidden title, traffic-light position | D-1, D-2; changing it restarts the dev app |
| C-2 | Capability (`src-tauri/capabilities/default.json`) | Adds `core:window:allow-start-dragging` and `core:window:allow-internal-toggle-maximize` | The default set lacks both **[verified]** |
| C-3 | Top bar as title bar (`App.tsx`, `App.css`) | `data-tauri-drag-region="deep"` on the bar; `platform-mac` class adds the left inset for the traffic lights; fixed bar height | Buttons/links block dragging by themselves **[verified, drag.js]** |
| C-4 | Platform flag (`src/lib/platform.ts`) | `isMac()` from the user agent, used once to set the class | No new dependency (D-4) |
| C-5 | Fixed pane for calendar (`App.tsx`, `App.css`) | `main-pane-fixed` also for the calendar view; the page child fills the pane; the shell hides the AI side panel in this view (`view-calendar`) | Journal already uses it; the side panel has nothing to show in the calendar |
| C-6 | Calendar page layout (`Calendar.tsx`, `App.css`) | Two columns: grid area (header, weekday row, week rows that share the height, compact legend) and the day column | Replaces square cells and the entries-below list |
| C-7 | Day column | Always present: hint "Pick a day…" until a day with entries is picked, then the heading and entries; scrolls inside itself | Keeps `data-testid="day-entries"` for the list |
| C-9 | Title-bar guard (`src/lib/titleBarGuard.ts`, `main.tsx`, capability `core:window:allow-set-title`) | On window focus, re-sets the same window title so tao re-applies the traffic-light position (macOS only, inside the real Tauri window) | Added after the user saw a black block at the top-left after switching apps; tao re-applies on redraw, title change and exiting full-screen, not on focus **[verified, tao 0.37.2]** |
| C-8 | Layout screenshot harness (dev only, `shot.html` + stub, `scripts/shot-metrics.sh`, `scripts/check-layout.sh`) | Renders the real app in headless Chrome with a stubbed backend so layout can be screenshotted at 1100x760 and 900x620 | Not bundled by `vite build`; evidence for AC-7/8/11 |

## Key flows

- **Launch:** Tauri creates the centred 1100x760 window with the Overlay bar; the page sets `platform-mac`; the bar clears the buttons. Diagram: *Product flow*.
- **Drag/zoom:** mouse-down on the bar → Tauri's injected script checks the drag attribute → `start_dragging` (or `internal_toggle_maximize` on double-click) → the capability allows it. Diagram: *Drag and zoom*.
- **Calendar:** open Calendar → fixed pane → grid fills height, day column beside it → pick a day → entries in the column. Diagram: *Calendar layout*.

## Contracts

| Where | Key | Value |
|-------|-----|-------|
| `tauri.conf.json` window | `width/height`, `minWidth/minHeight`, `center` | 1100/760, 900/620, true |
| same | `titleBarStyle`, `hiddenTitle`, `trafficLightPosition` | `"Overlay"`, true, `{x, y}` (provisional, tune on screen) |
| capability `default` | permissions added | `core:window:allow-start-dragging`, `core:window:allow-internal-toggle-maximize` |
| DOM | `.top-bar` | `data-tauri-drag-region="deep"` |
| DOM | `.shell.platform-mac` | present only when `isMac()` |
| CSS | `.platform-mac .top-bar` | `padding-left` >= 5rem (provisional) |
| DOM | calendar view | `main-pane-fixed` on `main-pane`; `.calendar` is a two-column grid; `data-testid="day-column"` |

## Tricky parts

- **Traffic-light geometry:** the bar must be tall enough to centre the buttons and wide enough on the left; the OS version changes the native offsets, so values are provisional and tuned in the interactive pass.
- **Grid sizing:** `aspect-ratio` on cells makes height depend on width, which is the bug. Rows must be `1fr` of a bounded container (`min-height: 0` all the way up from the shell), or the grid overflows again.
- **Six-week months:** four to six week rows must all fit at 900x620; rows share the height, mark size is fixed (34 px) and centred.
- **Min size vs journal:** at 900 px the journal columns (list 220, rules 14+14, side panel 240-320, paddings) must leave the editor a usable width. Checked by arithmetic in a static test and by screenshot.
- **Full-screen mode:** macOS hides the buttons in full screen, so the left inset is just empty space there; accepted.
- **Dragging vs controls:** only `deep` on the bar; controls never carry the attribute, so they never start a drag.

## Failure modes

| Failure | Effect | Mitigation |
|---------|--------|------------|
| Permission missing | Bar does not drag / zoom (silent) | AC-3 static test on the capability file |
| UA not detected as Mac | No inset; wordmark under the buttons | Test with a Mac UA; fallback leaves a normal bar |
| Calendar taller than the pane | Page would clip (pane is `overflow: hidden`) | `min-height: 0` chain + screenshot at 900x620 |
| Long day list | Column scrolls, grid unaffected | `overflow-y: auto` on the column only |
| Non-macOS system | `titleBarStyle` ignored, native frame stays | D-4; inset class absent |
| Title bar left stale after the app regains focus (black block at the top-left) | Native buttons area drawn wrongly until the next redraw | C-9 re-sets the title on focus; unconfirmed on the real window |

## Technology

CSS grid, React, Tauri 2 window config and capabilities, headless Chrome for the dev-only screenshot harness. No new
dependency, no new plugin, no ADR (all choices are reversible configuration).

## AC coverage

| AC | Component/flow |
|----|----------------|
| AC-1 | C-1 |
| AC-2 | C-1 |
| AC-3 | C-2 |
| AC-4 | C-3 |
| AC-5 | C-3, C-4 |
| AC-6 | C-3 |
| AC-7 | C-5, C-6, C-8 |
| AC-8 | C-6, C-8 |
| AC-9 | C-6, C-7 |
| AC-10 | C-6, C-7 |
| AC-11 | all (manual), C-8 |

## Questions to answer before approving this design

- [x] Add the dev-only screenshot harness (root-level `shot.html` + stub, not part of the production build) — yes (2026-11-09)
- [x] Detect macOS from the user agent, no OS plugin — yes (2026-11-09)
- [x] Start the traffic lights at x=18, y=17 and tune in the interactive pass — yes (2026-11-09); tuned with the user to x=18, y=26 and a 52 px bar
- [x] In macOS full-screen the left inset stays as empty space — accepted (2026-11-09)
