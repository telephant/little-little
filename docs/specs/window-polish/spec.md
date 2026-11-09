# Window polish — spec

Feature id `window-polish`. Follow-up to the painted UI (`docs/specs/paper-ui/`).

## 0. Review guide

**Summary:** Open the app at a comfortable size (1100x760, never smaller than 900x620), replace the grey
native title bar with the painted top bar (macOS "Overlay" style: the native close/minimise/zoom buttons stay,
our bar becomes the draggable title bar), and make the calendar page fit one screen: the month grid fills the
window height and the selected day's entries sit in a side column that scrolls on its own.

**Review order:** Decisions → Scope (§4) → ACs (§6).

**Decisions**

| ID | Decision | Status |
|----|----------|--------|
| D-1 | Default window 1100x760, minimum 900x620, centred; the size is not remembered between launches (no new dependency) | Decided (2026-11-09) |
| D-2 | Title bar: macOS Overlay style with hidden title; keep the native traffic-light buttons; our top bar is the draggable title bar | Decided (2026-11-09) |
| D-3 | Calendar page: month grid fills the available height (no square cells), compact legend under it, selected day's entries in a side column that is always present (hint text until a day is picked) and scrolls inside itself; the page never scrolls | Decided (2026-11-09) |
| D-4 | Platforms: the painted-bar treatment is for macOS. Other systems keep their native frame; the extra left inset for the traffic lights only applies on macOS | Decided as assumption (2026-11-09) |

**Open risks:** (1) Overlay title-bar height and traffic-light position differ between macOS versions **[verified in the Tauri schema description]**, so the inset must be tuned on the real window. (2) A custom drag region needs window permissions that are not in the default set **[verified: `core:window:allow-start-dragging` and `core:window:allow-internal-toggle-maximize` exist in the installed Tauri 2.12.5 ACL]**. (3) Fitting a six-row month plus legend into 620 px height must be proven on a real window; jsdom cannot measure layout. (4) The journal's three columns must still fit at 900 px.

**Prerequisites the user owns:** the final interactive pass (AC-11).

## 1. Problem

The window opens at 800x600 with no minimum, so the three-column journal feels cramped and can be shrunk until it
breaks. The title bar is a standard grey macOS bar showing "little-little", which clashes with the painted look. The
calendar page is taller than the window: six square-celled weeks plus header, legend and the day list force the page to scroll.

## 2. Goals

- G-1 The app opens at a size where every screen fits without scrolling the page — AC-1, AC-7, AC-8, AC-11.
- G-2 The window chrome matches the painted UI and still behaves like a macOS window — AC-2 to AC-6.
- G-3 The calendar is one screen, with the day's entries visible beside it — AC-7 to AC-10.
- G-4 Nothing that worked stops working — AC-10 and the existing suite (Definition of Done).

## 3. Data / reality

- `tauri.conf.json` today: one window, `title: "little-little"`, `width: 800`, `height: 600`, no min size, no title-bar style (native bar). **[verified, src-tauri/tauri.conf.json]**
- Tauri 2 window config offers `titleBarStyle` (Visible / Transparent / Overlay, macOS), `hiddenTitle`, `trafficLightPosition` (needs Overlay and decorations on), `minWidth`/`minHeight`, `center`. **[verified, config.schema.json of the installed CLI]**
- The default capability is `core:default`, `opener:default`, `dialog:default`; `core:window:allow-start-dragging` exists but is not in the default set. **[verified, gen/schemas/acl-manifests.json]**
- Overlay needs a custom drag region. In the installed Tauri 2.12.5 (`src/window/scripts/drag.js`): `data-tauri-drag-region="deep"` makes the whole subtree draggable, buttons/links/inputs never start a drag unless they carry the attribute themselves, a single click-drag calls `start_dragging` and a double-click calls `internal_toggle_maximize` (on macOS on mouse-up, cancelled if the pointer moved). **[verified]**
- Today's top bar already holds the wordmark, nav, Settings, activity dot and privacy note. **[verified, src/App.tsx]**
- Calendar cells use `aspect-ratio: 1` in a container capped at 600 px wide, so the grid height is set by its width. **[verified, src/App.css]**
- The journal shell columns are 1fr / 14 px / 240–320 px; the workspace is 220 px / 14 px / 1fr. **[verified, src/App.css]**

## 4. Scope — this milestone

**In:** window config (size, minimum, centre, Overlay, hidden title); drag region and window permissions; macOS
inset class; a focus guard that re-sets the window title so the macOS buttons stay placed after the app regains focus (added after a user report of a black block at the top-left); top-bar spacing for the traffic lights; the calendar page layout (fixed pane, filling grid, side column,
compact legend); keeping the other views usable at 900x620.

**Out (backlog):** remembering the window size/position; custom buttons or a painted frame for Windows/Linux; a
responsive layout below 900 px; a year overview; any change to calendar data or behaviour.

## 5. Users and key flows

- **Launch:** the window opens centred at 1100x760 with our painted bar on top and the macOS buttons at its left.
- **Move/zoom:** drag the bar to move the window; double-click it to zoom (as on any macOS window).
- **Calendar:** open Calendar → the month fills the window with no page scrolling → click a day → its entries appear in the right column → month arrows still work.
- **Resize:** shrink to 900x620: every view still fits; the window cannot get smaller.

## 6. Acceptance criteria

```
AC-1  Window size
  Given the app configuration
  When  it is read
  Then  the window opens centred at 1100x760 with a minimum of 900x620
  Verify: auto

AC-2  Painted title bar style
  Given the app configuration
  When  it is read
  Then  the window uses the Overlay title bar with a hidden title, native frame buttons kept, and a traffic-light position set
  Verify: auto

AC-3  Dragging is permitted
  Given the main window capability
  When  it is read
  Then  it grants core:window:allow-start-dragging and core:window:allow-internal-toggle-maximize to the main window
  Verify: auto

AC-4  The top bar is the drag region
  Given the unlocked app
  When  the top bar renders
  Then  the bar carries data-tauri-drag-region="deep", and none of its buttons or links carries a drag attribute (so pressing a control never starts a drag)
  Verify: auto

AC-5  Room for the macOS buttons
  Given the app running on macOS, and the app running on another system
  When  the top bar renders
  Then  on macOS it has a left inset of at least 5rem (provisional) so the wordmark clears the traffic lights, on other systems it has none
  Verify: auto

AC-6  The bar still works
  Given the painted bar
  When  the user clicks Journal, Calendar, Search and Settings
  Then  each view opens as before and the activity dot and privacy note keep their testids and wording (on windows narrower than 1000 px the privacy note shows only its key word, On-device or Cloud, so the bar never wraps)
  Verify: auto

AC-7  The calendar page does not scroll
  Given the calendar view
  When  it renders
  Then  the main pane is fixed (no page scroll), the calendar fills the pane height, and only the day-entries column can scroll
  Verify: auto (structure) + manual (look)

AC-8  The grid fills the height
  Given the calendar month
  When  it renders in any window size
  Then  the day cells share the available height instead of being square, so six weeks fit without overflow
  Verify: auto (structure) + manual (look)

AC-9  Day entries sit in a side column
  Given the calendar view with no day picked, and then a day with entries picked
  When  the user clicks the day
  Then  the column beside the grid first shows a "pick a day" hint, then that day's entries; the column scrolls on its own when the list is long
  Verify: auto

AC-10 Calendar behaviour unchanged
  Given the calendar with painted marks, moods and several entries on a day
  When  the user navigates months, opens a day and opens one of its entries
  Then  marks, legend, counts and navigation behave exactly as before
  Verify: auto

AC-11 Interactive pass
  Given the real app at the default size and at the minimum size
  When  the user drags and zooms the window and visits journal, calendar, search and settings
  Then  the bar looks painted and clears the macOS buttons, no view scrolls the page except where it did before, and the calendar fits one screen at both sizes
  Verify: manual
```

Provisional targets (measure on the real window): traffic-light inset 5rem; traffic-light position; calendar
side column width 280 px; header and legend heights. Final values after tuning: inset 6.4rem, buttons at x=18 y=26, bar 52 px, day column 280 px.

## 7. Non-functional requirements

- No new runtime dependency; no new window plugin.
- Light theme only; keyboard focus stays visible; the bar's controls keep their accessible names.
- Dragging the bar must never start while pressing a control inside it.
- The calendar must not re-fetch data just because the layout changed.

## 8. Assumptions

- macOS is the supported platform for the painted bar (D-4); on other systems `titleBarStyle` is ignored and the native frame remains.
- The user does not need the window size remembered (D-1).
- 900x620 is large enough for every view; if not, the minimum is raised, not the layout redesigned.

## Glossary

- **Overlay title bar** — a macOS style where the title bar is transparent and our web content draws under it, while the native close/minimise/zoom buttons stay.
- **Traffic lights** — the red/yellow/green window buttons at the top-left of a macOS window.
- **Drag region** — an element marked `data-tauri-drag-region`; dragging it moves the window.
- **Fixed pane** — the main pane styled not to scroll as a whole (`main-pane-fixed`), so inner columns scroll on their own.
- **Screenshot harness** — a dev-only page (`shot.html`) that runs the real app against a stubbed backend in headless Chrome so layout can be measured and screenshotted; never part of the production build.
- **Day column** — the side column of the calendar page that lists the selected day's entries.
