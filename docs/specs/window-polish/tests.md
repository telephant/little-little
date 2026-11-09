# window-polish — tests

## Test data

- Static checks read `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` and `src/App.css` (as raw text/JSON imports) in `src/lib/windowConfig.test.ts`.
- Component tests use `src/test/fakeIpc.ts`; the user agent is stubbed with `Object.defineProperty(navigator, 'userAgent', ...)` and restored after each test.
- Calendar fixtures: a six-week month (a month whose first day is a Sunday and 31 days), painted marks on some days, one day with ten entries.
- Harness (dev only): `shot.html` + `shot-stub.js` at the project root with demo data (a few painted marks, a long day list); metrics are printed into the DOM and read with `chrome --headless --dump-dom`.
- jsdom cannot measure layout, so real sizes are checked only by the harness (TC-12, TC-14, TC-15) and by the user (TC-13).

## Cases

| ID | AC | Level | Case (Given / When / Then) | File |
|----|----|-------|------|------|
| TC-1 Window size and minimum | AC-1 | unit | Given src-tauri/tauri.conf.json, when a test parses it, then the main window has width 1100, height 760, minWidth 900, minHeight 620 and center true. | src/lib/windowConfig.test.ts |
| TC-2 Overlay title bar settings | AC-2 | unit | Given src-tauri/tauri.conf.json, when a test parses it, then titleBarStyle is Overlay, hiddenTitle is true, decorations is not turned off, and trafficLightPosition has numeric x and y. | src/lib/windowConfig.test.ts |
| TC-3 Drag permissions granted | AC-3 | unit | Given src-tauri/capabilities/default.json, when a test parses it, then the permissions include core:window:allow-start-dragging and core:window:allow-internal-toggle-maximize and the capability targets the main window. | src/lib/windowConfig.test.ts |
| TC-4 Top bar is the drag region | AC-4 | integration | Given the unlocked app, when the top bar renders, then it has data-tauri-drag-region="deep" and none of its buttons or links carries a drag attribute. | src/App.test.tsx |
| TC-5 Inset only on macOS | AC-5 | integration | Given the user agent set to a Macintosh one, then to a Windows one, and the stylesheet, when the app renders and the CSS is read, then on macOS the shell has the platform-mac class and the CSS gives .platform-mac .top-bar a padding-left of at least 5rem, on the other system the class is absent. | src/App.test.tsx, src/lib/windowConfig.test.ts |
| TC-6 The bar still works | AC-6 | integration | Given the painted bar, when the user clicks Journal, Calendar, Search and Settings, then each view opens as before and the activity dot and privacy note keep their testids and wording. | src/App.test.tsx |
| TC-7 Calendar page does not scroll | AC-7 | integration | Given the calendar view, when it renders and the stylesheet is read, then the main pane has main-pane-fixed, the calendar fills the pane, and only the day column has overflow-y auto. | src/Calendar.test.tsx, src/lib/windowConfig.test.ts |
| TC-8 Grid fills the height | AC-8 | unit | Given the stylesheet, when a test reads the calendar rules, then day cells have no aspect-ratio, the grid is flex 1 with min-height 0, and its week rows are minmax(0,1fr) so they share the height. | src/lib/windowConfig.test.ts |
| TC-9 Day column | AC-9 | integration | Given the calendar with no day picked, then a day with entries picked, when the user clicks the day, then the column first shows the 'pick a day' hint (data-testid day-hint), then that day's entries (data-testid day-entries) in the same column. | src/Calendar.test.tsx |
| TC-10 Calendar behaviour unchanged | AC-10 | integration | Given the calendar with painted marks, moods and several entries on one day, when the user navigates months, opens a day and opens an entry, then marks, legend, counts and navigation behave as before and the opened entry shows in the journal. | src/Calendar.test.tsx |
| TC-11 Journal fits at the minimum width | AC-11 | unit | Given the stylesheet and the 900 px minimum, when a test adds up the minimum column widths, rules, gaps and paddings of the journal view, then the editor keeps at least 300 px. | src/lib/windowConfig.test.ts |
| TC-12 Layout metrics at both sizes (harness) | AC-7 | e2e | Given the screenshot harness at 1100x760 and at 900x620 on a six-week month with a long day list, when the metrics script runs in headless Chrome, then the main pane has no vertical overflow (scrollHeight <= clientHeight), every week row is at least 55 px tall, the day column is visible, and the journal view has no horizontal overflow at 900. | shot.html + scripts/check-layout.sh |
| TC-13 Interactive pass | AC-11 | manual | Given the real app at the default and the minimum size, when the user drags and zooms the window and visits journal, calendar, search and settings, then the bar looks painted and clears the macOS buttons, no view scrolls the page except where it did before, and the calendar fits one screen at both sizes. | manual |
| TC-14 Spike: baseline of the old layout (harness) | AC-7 | e2e | Given the screenshot harness and the calendar as it is today, when headless Chrome renders it at 900x620 and the metrics run, then the metrics report the overflow of the old layout (pane scrollHeight > clientHeight), proving the harness can see the bug. | shot.html |
| TC-15 Fits with the bar height (harness) | AC-8 | e2e | Given the harness at 900x620 after the layout change, when the metrics run, then the calendar grid bottom is above the legend, and the legend bottom is within the pane. | shot.html + scripts/check-layout.sh |

## Manual checklist (AC-11)

- [ ] The app opens centred at about 1100x760 with the macOS buttons at the left of our bar and no grey native bar
- [ ] The wordmark clears the buttons; the buttons look vertically centred in the bar (tune x/y and inset if not)
- [ ] Dragging the bar moves the window; double-click zooms; pressing Journal/Calendar/Search/Settings never drags
- [ ] The window cannot be made smaller than 900x620
- [ ] Journal, Search and Settings look right at 900x620 (nothing cut off, no horizontal scroll)
- [ ] Calendar at 1100x760 and 900x620: the whole month, legend and day column are visible with no page scrolling
- [ ] Pick a day with entries: they appear in the right column; a long list scrolls inside the column only
- [ ] Painted marks and moods still show correctly in the calendar

## Measurements (not pass/fail yet)

| What | How |
|------|-----|
| Traffic-light position x/y (start 18/17) | tuned on the real window with the user: final x=18, y=26 with a 52 px bar (buttons' centre line = y, from the window library source) |
| Left inset for the bar (start 5.2rem; final 6.4rem after the user asked for more air) | the gap between the buttons and the wordmark in the real window |
| Day column width (start 280 px) | harness screenshots and the real window |
| Header, weekday-row and legend heights; week-row height at 620 px | harness metrics (TC-12) |
| Test thresholds (week row >= 55 px, editor >= 300 px at 900) are provisional, derived from the design arithmetic (about 70 px per row, about 320 px editor) with margin | revisit after the first harness run |

