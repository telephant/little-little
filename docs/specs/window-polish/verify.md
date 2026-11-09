# window-polish — verify

Verified 2026-11-09. **Verdict: pass.** The one problem found in the interactive pass (F-1) is fixed, confirmed by the user.

## Run (this session)

`pnpm check`: exit 0. 13 frontend test files, **191 tests passed** (3 further full runs stable); `tsc` and `vite build` clean (no `shot*` files in `dist`); Rust **72 passed, 0 failed, 5 ignored**; `clippy -D warnings` clean. Layout check `scripts/check-layout.sh`: **19/19 PASS** at 1100x760 and 900x620.

## Results

| AC | Test(s) | Result | Evidence |
|----|---------|--------|----------|
| AC-1 window size | TC-1 | pass | windowConfig.test.ts |
| AC-2 Overlay title bar | TC-2 | pass | windowConfig.test.ts |
| AC-3 drag permissions | TC-3 (+ set-title) | pass | test; the Rust build validated the permission names |
| AC-4 bar is the drag region | TC-4 | pass | App.test.tsx (attribute check; real dragging is part of AC-11) |
| AC-5 room for the macOS buttons | TC-5 (component + css) | pass | App.test.tsx, windowConfig.test.ts |
| AC-6 the bar still works | TC-6 + privacy-note test | pass | App.test.tsx |
| AC-7 calendar page does not scroll | TC-7, TC-12/14 | pass | Calendar.test.tsx; harness: pane 568/568 at 900x620, 708/708 at 1100x760 |
| AC-8 grid fills the height | TC-8, TC-15 | pass | windowConfig.test.ts; harness week rows 66 px / 89 px |
| AC-9 day column | TC-9 | pass | Calendar.test.tsx |
| AC-10 calendar behaviour unchanged | TC-10 + earlier calendar tests | pass | Calendar.test.tsx |
| AC-11 interactive pass | TC-13 / TC-11 (static) | **manual-ok** | the user did the pass on the real window: the only problem found was the black block (F-1), now fixed and confirmed by the user ("it is fixed", 2026-11-09). TC-11 static (editor >= 300 px at 900) passes: 322 px |

## Measurements (harness, real app with stubbed backend)

| What | Result |
|------|--------|
| Week row height, six-week month | 66 px at 900x620; 89 px at 1100x760 (threshold 55 px, provisional) |
| Calendar header + weekday row; legend | 49 px; 26 px (one line) |
| Day column width | 280 px (kept) |
| Bar | 52 px tall, all items centre at 26 px, text unwrapped |
| Journal at 900x620 | editor 322 px (was 263 px before the side panel narrowed), list 220, side panel 240 |
| Left inset / button position (tuned on the real window) | 6.4rem; buttons x=18, y=26 |

## Drift check

Fixed in this verify: provisional values in `tests.md`/`design.md`/`spec.md` updated to the tuned ones (inset 6.4rem, y=26, bar 52 px); AC-6 now notes that on windows under 1000 px the privacy note shows only On-device / Cloud; the design and spec now include the title-bar focus guard (C-9) and the check script (C-8); layout check count corrected to 19. Names, permissions and CSS classes match the code. No ADR involved.

## Scope

Nothing from `backlog.md` was implemented (painted window buttons, remember size/position, Windows/Linux bar, responsive layout, year view). Added beyond the original spec at the user's request: more space before the title, the focus guard (see F-1).

## Findings

| # | Finding | Status |
|---|---------|--------|
| F-1 | **Black block at the top-left of the window (where the macOS buttons are) when the app regains focus from another app.** Not reproducible in the harness (no native frame). Hypothesis from tao 0.37.2 source: the title bar is re-laid out on activation and the custom `trafficLightPosition` is not re-applied (tao re-applies on redraw, `setTitle` and exiting full-screen only). `src/lib/titleBarGuard.ts` re-sets the title on focus. | **Fixed, confirmed by the user (2026-11-09).** The user had reported it still appeared right after the guard was added; it was then reported fixed. The exact cause was never captured (no screenshot or native log), so it is not proven that the guard alone fixed it; the guard stays as the mitigation and the fallback options (re-apply on resize/move, or a standard 28 px bar without `trafficLightPosition`) are recorded in the plan notes. If it comes back, capture a screenshot into `evidence/`. |

Evidence folder for the capture: `docs/specs/window-polish/evidence/`.
