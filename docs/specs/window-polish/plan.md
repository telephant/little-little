# window-polish — plan

## Plan validation

Checks run (grep over the docs, 2026-11-09):

| # | Check | Result |
|---|-------|--------|
| 1 | AC -> test: 11/11 ACs have >= 1 TC; no orphan TC (15 TCs) | pass |
| 2 | AC -> design coverage table (design.md) | pass |
| 3 | AC -> task: every AC named in >= 1 task | pass |
| 4 | Names consistent: `data-tauri-drag-region="deep"`, `platform-mac`, `main-pane-fixed`, `day-column`, `day-hint`, `day-entries`, permissions `core:window:allow-start-dragging` / `allow-internal-toggle-maximize`, window values 1100/760/900/620 across spec, design, tests, tasks | pass |
| 5 | No ADR involved (design needs none); no Proposed ADR | pass |
| 6 | Invented numbers: 5.2rem, x18/y17, 280 px, 55 px row threshold, 300 px editor threshold are tagged provisional (spec, design, tests Measurements); user-decided numbers (1100x760, 900x620) are requirements | pass |
| 7 | Backlog leakage (remember size, Windows/Linux bar, responsive layout, year view) | none |
| 8 | Every task file carries the full Given/When/Then of its TCs | pass |
| 9 | Unchecked design checklist / open questions | none |

Findings fixed: "screenshot harness" added to the spec glossary; the two test thresholds were labelled provisional in tests.md.

Notes: the harness (T-01) is dev tooling that lets the agent see layout; macOS-only chrome (buttons, drag, zoom) can only be confirmed by the user (checkpoint after T-03, then T-06). T-02 does not depend on the spike.


## Order (walking skeleton)

Spike first: **T-01** builds the screenshot harness and proves it can see today's calendar overflow. It de-risks the biggest unverified claim (that layout can be checked without a human looking at the real window) and gives a before-picture. T-02 does not depend on it and can proceed in parallel in principle.

| Phase | Tasks | Milestone / ACs | Effort |
|---|---|---|---|
| 0 Spike | T-01 | harness works, baseline overflow reproduced (AC-7 evidence) | M |
| 1 Window chrome | T-02, T-03 | size, Overlay, permissions, drag, inset: AC-1..6 (then the user looks at the buttons once) | M |
| 2 Calendar | T-04, T-05 | one-screen calendar and its evidence: AC-7..10, AC-11 (static) | M |
| 3 Close | T-06 | AC-11 (user) | S + user |

## Spike result (T-01, 2026-11-09)

The harness works: `scripts/shot-metrics.sh <calendar|journal> <w> <h> [out.png] [pick]` runs the real app against `shot-stub.js` in headless Chrome and prints layout metrics (viewport verified exact: 900x620 and 1100x760; the script adds 87 px of Chrome frame for the metrics run and none for screenshots). It is dev-only: `vite build` output contains no `shot` files.

Baseline of today's layout (TC-14, AC-7): the calendar overflows at both sizes: 900x620 pane content 1105 px in a 571 px pane; 1100x760 content 1147 px in 711 px. Six week rows are 69 px (900) / 83 px (1100) because the square cells follow the width. The legend wraps to two lines and the selected day's list is below the fold. Screenshots looked at. Journal at 900x620: no vertical or horizontal overflow, **but** the editor is only 263 px wide (list 220, side panel 320 = its max, pane 566), below the provisional 300 px target; the design arithmetic (about 320 px) assumed a narrower side panel.

Decision for T-04 (no spec change): narrow the side panel at small widths (e.g. `minmax(240px, 22vw)`) so the editor reaches >= 300 px at 900 px; TC-11 will drive it.

- T-02: the Rust build (`tauri-build`) validates `capabilities/default.json` against the permission list, so the two new permission names are confirmed to exist beyond the static test. The Overlay look itself is only visible in the real window (checked after T-03).

- T-03 (tuned with the user on the real window): first `trafficLightPosition.y` 17 -> 21 (buttons too high), then I made the bar taller (about 76 px, content centre 38 px) assuming the buttons' centre was y + 6; the user then reported the title and the buttons were still not on one row. Reading tao 0.37 `inset_traffic_lights` showed the buttons' centre line is about `y` px from the window top, so the fix was a compact 52 px border-box bar (content centre 26 px) with `y = 26`; the pinned test now ties `y` to half the bar height. Harness: wordmark, nav, Settings and the privacy note all centre at 26 px at both window sizes. Confirmed by the user on the real window ("all on one row now", 2026-11-09). Dragging and double-click zoom stay on the T-06 checklist.

- T-03 follow-up (user): left inset 5.2rem -> 6.4rem for more air between the macOS buttons and the wordmark. The user also asked for grey native buttons until the bar is hovered; verified this is not possible with the native buttons (macOS draws them above the web view; Tauri's config has no tint option; tao has `with_titlebar_buttons_hidden` but Tauri does not expose it, so hiding them would need a new native dependency). The only route is `decorations: false` with painted buttons (loses native corners and needs close/minimise/zoom/full-screen rebuilt). User decision: keep the native buttons; custom painted buttons are backlog.

- T-04: three things beyond the task text. (1) In the calendar view the shell hides the AI side panel and its blue rule (`view-calendar` class) so the calendar gets the full width: with the 320 px side panel kept, a 280 px day column would have left only about 196 px for the month at 900 px; the AI panel has nothing to show in the calendar anyway. (2) Looking at the harness screenshot found the bar wrapping at 900 px (the wordmark and the privacy note each broke onto two lines because the 6.4 rem macOS inset ate the width): `white-space: nowrap` on the bar's text and the privacy note now keeps its key word (On-device / Cloud) and drops the detail tail below 1100 px. (3) `resetFake()` now uses `mockReset()` (restores the original implementation) instead of `mockClear()`: a permanent `mockResolvedValue` in one calendar test had leaked into later tests. An older App test that asserted the calendar pane scrolls was updated (the calendar is a fixed pane now; search is checked instead).
  Harness (T-05 will formalise): 900x620 calendar: pane 568/568 (no overflow), six week rows of 66 px, legend and day column inside the pane; 1100x760: rows 89 px; journal at 900: editor 322 px (was 263), side panel 240, no overflow; bar items all centre at 26 px.

- T-05: `scripts/check-layout.sh` runs the harness at 1100x760 and 900x620 and asserts the rules (19 checks: exact viewport, no page scroll, no horizontal overflow, six week rows >= 55 px, grid above the legend and legend inside the window, day column visible, journal no overflow, editor >= 300 px at 900, bar items on one centre line, bar text not wrapped, bar 52 px). Mutation-checked (demanding 90 px rows fails). All 20 pass; screenshots looked at (calendar 900 and 1100, journal 900). The screenshots found that the privacy note showed only "ON-DEVICE" at the default 1100 px width because my narrow-window cut-off was exactly 1100 px; moved to 1000 px so the full wording shows at the default size. Measured: week rows 66 px (900x620) and 89 px (1100x760), editor 322 px at 900.

- Post-T-05 fix (user report: a black block appears at the top-left of the window, where the macOS buttons are, when the app regains focus from another app): Cause (from tao 0.37.2 source, not reproducible in the harness): the window library re-applies the custom `trafficLightPosition` when the view redraws, on `setTitle`, and after leaving full-screen, but not on `windowDidBecomeKey`, so a title-bar relayout on activation can leave it stale. Mitigation: `src/lib/titleBarGuard.ts` re-sets the same window title whenever the window gets focus (which runs tao's own re-apply path), installed in `main.tsx` only inside the real Tauri window on macOS; capability `core:window:allow-set-title` added; unit-tested with a fake window (focus -> setTitle, blur -> nothing, failures swallowed, title equals the config). The user first reported the block still appeared, then confirmed it fixed (2026-11-09); the exact cause was not captured, so the guard stays as the mitigation. If it persists, next options: reapply on window resize/move as well, or drop `trafficLightPosition` and accept the default button position.

## Tasks

| Task | Title | Implements | Depends on |
|---|---|---|---|
| ✅ 2026-11-09 [T-01](tasks/T-01.md) | Spike: screenshot harness and baseline of the old calendar | AC-7 | - |
| ✅ 2026-11-09 [T-02](tasks/T-02.md) | Window config and capability | AC-1, AC-2, AC-3 | - |
| ✅ 2026-11-09 [T-03](tasks/T-03.md) | Top bar as the title bar | AC-4, AC-5, AC-6 | T-02 |
| ✅ 2026-11-09 [T-04](tasks/T-04.md) | Fixed pane, filling calendar grid and day column | AC-7, AC-8, AC-9, AC-10, AC-11 | T-03 |
| ✅ 2026-11-09 [T-05](tasks/T-05.md) | Layout evidence at both sizes | AC-7, AC-8 | T-01, T-04 |
| [T-06](tasks/T-06.md) | Interactive pass (manual) | AC-11 | T-05 |

## Definition of Done (every task)

- Tests from the task written first and green; `pnpm check` green (vitest, tsc, build, cargo test, clippy). No task is closed while the check is red.
- Docs updated (spec/design if reality differs); `status.yaml` AC status updated.
- No secrets, no new dependency or plugin; the dev-only harness is not in the production bundle.
- Anything only a real macOS window can show (buttons, drag, zoom) is confirmed by the user; layout is also confirmed by harness metrics and screenshots the agent has looked at.

## Out of this milestone

Everything in `backlog.md` (remember size/position, Windows/Linux bar, responsive layout below 900 px, year overview).
