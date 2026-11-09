# Window polish — design detail

Reference only; not required reading for approval.

## Window config (C-1)

```json
"windows": [{
  "title": "little-little", "width": 1100, "height": 760, "minWidth": 900, "minHeight": 620,
  "center": true, "titleBarStyle": "Overlay", "hiddenTitle": true,
  "trafficLightPosition": { "x": 18, "y": 26 }
}]
```
`trafficLightPosition` requires `titleBarStyle: Overlay` and decorations on (the default) **[verified, schema]**. The x/y are logical
pixels and provisional. `title` stays for the Dock/Mission Control name.

## Capability (C-2)

Add to `src-tauri/capabilities/default.json` permissions: `core:window:allow-start-dragging`, `core:window:allow-internal-toggle-maximize`.
Both exist in the installed ACL **[verified]**; neither is in `core:default`.

## Top bar (C-3, C-4)

```tsx
<header className="top-bar" data-tauri-drag-region="deep" data-testid="top-bar"> … unchanged children … </header>
<div className={`shell ${isMac() ? "platform-mac" : ""}`}>
```
CSS: `.top-bar { box-sizing: border-box; height: 52px; padding: 0 1.6rem; }` and `.platform-mac .top-bar { padding-left: 6.4rem; }` (was 5.2rem; the user asked for a bit more air between the buttons and the title). **Button geometry** (verified in tao 0.37 `inset_traffic_lights`): the window library sizes the title-bar container to `button height + trafficLightPosition.y` and leaves the buttons at its bottom, so the buttons' centre line is about `y` px below the window top. The bar centres its content on its half height (26 px), so `y = 26` puts wordmark, nav, Settings and the privacy note on the buttons' line (harness: all centre at 26 px at 1100x760 and 900x620). Keep bar height and `y` equal within 1 px (pinned by `windowConfig.test.ts`).
bottom hairline stays. `isMac()` = `/Mac/.test(navigator.userAgent)` (WKWebView reports "Macintosh") **[assumption: verified on first run]**.
Drag script behaviour **[verified, drag.js]**: bare attribute = only direct clicks; `"deep"` = subtree; clickable tags (A, BUTTON, INPUT, SELECT,
TEXTAREA, LABEL, SUMMARY), `[role=button|link|tab|…]` and `[tabindex]` block dragging unless they carry the attribute.

## Fixed pane (C-5)

`App.tsx`: the main pane gets `main-pane-fixed` when unlocked, not onboarding, not settings, and `view` is `journal` or `calendar`.
CSS generalises the rule: `.main-pane-fixed > * { min-height: 0; }` and the page root (`.workspace`, `.calendar`) gets `flex: 1`.

## Calendar layout (C-6, C-7)

```
.calendar        { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 1.6rem; height: 100%; min-height: 0; max-width: none; }
.calendar-main   { display: flex; flex-direction: column; min-height: 0; }
.calendar-grid   { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, 1fr);
                   grid-template-rows: auto; grid-auto-rows: minmax(0, 1fr); }
.calendar-grid .day { aspect-ratio: auto; }          /* the old square cells are removed */
.day-column      { min-height: 0; overflow-y: auto; border-left: 1px solid var(--hair); padding-left: 1.2rem; }
```
Header and legend are fixed-height rows above/below the grid. The weekday labels are the first (auto) grid row. 280 px for the
column is provisional. `Calendar.tsx` keeps its state and effects; only the JSX structure changes (a `calendar-main` wrapper, the day column
always rendered). The entries list keeps `data-testid="day-entries"`; the empty state is `data-testid="day-hint"`.

Fit arithmetic at the minimum (620 px): bar 44 + pane padding 48 + header ~40 + weekday row ~22 + legend ~44 = ~198, leaving ~420 px
for 6 week rows = 70 px per row (mark 34 px) **[assumption, checked by screenshot]**.

## Journal at the minimum width

Measured with the harness at 900x620 (T-01): pane 566, entry list 220, side panel 320 (its `minmax(240px, 320px)` maximum), editor 263 px. The earlier
estimate (about 320 px) wrongly assumed a 240 px side panel. To keep the editor >= 300 px (TC-11) the side column becomes narrower at small widths, e.g.
`minmax(240px, 22vw)` (about 240 px at 900, about 320 at 1450), giving the editor about 340 px at 900. The static test sums the minimum widths from the CSS.

## Screenshot harness (C-8, dev only)

`shot.html` at the project root (served by `vite dev`, never built by `vite build`, which only builds `index.html`) loads `shot-stub.js`,
which defines `window.__TAURI_INTERNALS__.invoke` for the commands the app calls on the way to the calendar (journal_exists, unlock,
get_settings, list_entries, get_entry, create_entry, calendar_month, get_activity, list_available_models, ...) returning demo data with a few painted
marks, then imports `/src/main.tsx`. It then fills the passphrase, clicks Unlock and the Calendar link. Headless Chrome screenshots at
1100x760 and 900x620 (`--window-size`, `--virtual-time-budget`) give layout evidence; macOS buttons and the native frame are not part of it.

## Security / privacy

No new data, IPC or network. Two window permissions are added to the main window only.

## Extension points (not built)

Remember size/position (window-state plugin), a painted frame for Windows/Linux, a responsive layout below 900 px, a year view.

## Title-bar guard (C-9)
`installTitleBarGuard(win)` listens to `onFocusChanged` and, when the window gains focus, calls `setTitle(WINDOW_TITLE)` (same text as `tauri.conf.json`).
In tao 0.37.2 `set_title_async` ends with `reapply_traffic_light_inset`, which restores the custom button position; the same call also happens on view
redraw and after leaving full-screen, but not in `windowDidBecomeKey` **[verified]**. Installed from `main.tsx` only when `isMac()` and `window.__TAURI_INTERNALS__.metadata`
exists (not in a browser, tests or the screenshot harness). Needs `core:window:allow-set-title`. Failures are swallowed (the guard is only a mitigation).

## Privacy note on narrow windows
`PrivacyBadge` renders `<span>On-device|Cloud</span><span class="privacy-detail"> · stays on this device | · text goes to Claude</span>`; below 1000 px the detail span is hidden so the bar stays on one row. The key words still differ by words, not colour.
