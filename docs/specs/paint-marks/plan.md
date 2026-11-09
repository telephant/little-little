# paint-marks — plan

## Plan validation

Checks run (grep over the docs, 2026-11-09):

| # | Check | Result |
|---|-------|--------|
| 1 | AC -> test: 14/14 ACs have >= 1 TC; no orphan TC (21 TCs) | pass |
| 2 | AC -> design coverage table (design.md) | pass |
| 3 | AC -> task: every AC named in >= 1 task | pass |
| 4 | Names consistent: `set_mark`, `clear_mark`, `validate_mark`, `entries.mark`, `DayMood.mark`, `MoodMark` `mark` prop, `data-painted` across spec, design, tests, tasks | pass |
| 5 | No Proposed ADR (ADR-0006 Accepted 2026-11-09) | pass |
| 6 | Invented numbers (8 strokes, 400 points, 480 range, 8 KB, epsilon 0.8) are tagged provisional (spec D-6, Measurements) | pass |
| 7 | Backlog leakage (several marks, shuffle, palette, gallery, image export) | none |
| 8 | Every task file carries the full Given/When/Then of its TCs | pass |
| 9 | Open questions / unchecked design checklist items | none |

Findings fixed: spec goal G-4 pointed at "AC-14" as the no-regression check, but AC-14 is now the Cancel behaviour; G-4 now cites AC-10 and the Definition of Done.

Notes: the backend tasks (T-02..T-04) do not depend on the spike; frontend T-07 does. The agent cannot screenshot, so every visible-UI task is confirmed by the user in the running app (as in the painted UI milestone).


## Order (walking skeleton)

Spike first: **T-01** de-risks the biggest unverified claim (smooth pointer drawing in the real WKWebView). Backend tasks T-02 and T-05 do not depend on it, so they can proceed while the spike is judged.

| Phase | Tasks | Milestone / ACs | Effort |
|---|---|---|---|
| 0 Spike | T-01 | drawing proven or approach changed | S |
| 1 Backend | T-02, T-03, T-04 | store, read, calendar, backup, IPC, privacy: AC-1,2,3,9,10,11 | M |
| 2 Frontend | T-05, T-06, T-07 | draw, save, reset, cancel, display everywhere: AC-4,5,6,7,8,12,14 | L |
| 3 Close | T-08 | AC-13 (user) | S + user |

## Change request 2026-11-09 (after first look at the built canvas)

User feedback on the running app: drop the preview (the canvas should render the final look), add colour selection, and make it obvious that a mark can be repainted. Spec D-3 (fixed mood colour) is superseded by D-9; D-10 (WYSIWYG canvas) and D-11 (label) added; ACs 15-17 added and AC-8 reworded; ADR-0006 gained a backward-compatible `colors` key. New tasks T-09 and T-10 run before the interactive pass T-08.

## Spike result (T-01, 2026-11-09)

In the real Tauri webview (WKWebView, dev window) pointer drawing with `setPointerCapture` and `touch-action: none` followed a trackpad smoothly (user-confirmed by eye; the agent cannot screenshot), and the smoothed strokes with the existing `#paint-s` filter at stroke width 5 in the 48-unit box looked like marker at 84, 44 and 26 px. Decision: keep the design as written. Starting values for T-05/T-07: stroke width 5 (box units), midpoint-quadratic smoothing; simplification epsilon to tune in T-07.

- T-02: restore's blank-draft cleanup runs inside a transaction that rolls back when restore refuses, so a refused restore leaves a blank draft in place (existing behaviour, unchanged); TC-15 therefore proves protection by clearing the mark and watching restore succeed. The `#[allow(dead_code)]` markers on `set_mark`, `clear_mark`, `InvalidMark` and `storage/mark.rs` must be removed in T-04 when the commands use them.

- T-03: `ExportEntry.mark` is skipped when empty (`skip_serializing_if`), so backups and the generated fixture files stay byte-identical for entries without a mark; the generated-fixtures sync test (`testdata`) stayed green.

- T-04: the privacy guard TC-17 was mutation-checked (making the search prompt include a mark made it fail; reverted). The temporary `dead_code` markers from T-02 are removed; clippy is clean. The fake backend (`fakeIpc.ts`) now has `setMark`/`clearMark`, `mark` on entries and summaries, and the calendar day mark (latest painted entry of the day).

- T-06: a painted mark with no mood keeps `data-mood="none"` plus `data-painted="true"` (colour = ink); existing ring checks only look at marks without a painted stroke set, so they are unaffected. A stored mark that fails to decode renders the default mark.

- T-07: jsdom has no PointerEvent, so the canvas tests dispatch `MouseEvent`s named `pointerdown/pointermove/pointerup` (they carry clientX/clientY into React). The canvas falls back to a 240 px size when the element reports no width. Stroke simplification epsilon starts at 0.8 box units (8 tenths) and loosens automatically if a stroke would exceed the point limit; tune on screen in the interactive pass.

- T-10: the swatch for "mood colour" is drawn in the entry's current mood colour (ink if none). Chosen colours are stored per stroke (`colors`), so changing the mood only recolours "mood colour" strokes. Header label is part of the same button that opens the canvas (aria-label "paint your own mark" / "repaint your mark").

- Post-T-10 fix (user report: the line shook while drawing): (1) points are now thinned as they arrive (a point is kept after the pointer moves 0.6 box units), so the line already drawn never changes as the stroke grows and what is shown while drawing is exactly what is kept; simplification only applies at the 400-point limit. (2) The `paint-s` filter now has a fixed user-space region instead of one tied to the stroke's bounding box, so the marker texture no longer shifts as a stroke grows. Tests: the drawn part never changes, shown == kept on release, dense input stays within the limit, and the filter region is fixed. Not yet confirmed on screen.
- Stroke width: measured at 236/84/44/34 px in headless Chrome, the stroke is 10-11% of the mark's size at every size, so the canvas already matches the result proportionally; it only looks thicker because the canvas is about 3x larger than the header mark. User chose to keep the same ratio as the header mark, so width stays 5 units.

## Tasks

| Task | Title | Implements | Depends on |
|---|---|---|---|
| ✅ 2026-11-09 [T-01](tasks/T-01.md) | Spike: pointer drawing in the real Tauri window | AC-5 | - |
| ✅ 2026-11-09 [T-02](tasks/T-02.md) | Backend storage: migration v3, mark validation, set/clear, reads | AC-1, AC-2, AC-3, AC-4, AC-9 | - |
| ✅ 2026-11-09 [T-03](tasks/T-03.md) | Backend: calendar day mark and JSON backup/restore | AC-9, AC-10 | T-02 |
| ✅ 2026-11-09 [T-04](tasks/T-04.md) | IPC, types, fake backend and privacy guard | AC-2, AC-11 | T-02, T-03 |
| ✅ 2026-11-09 [T-05](tasks/T-05.md) | Stroke library (mark.ts) | AC-5 | - |
| ✅ 2026-11-09 [T-06](tasks/T-06.md) | MoodMark painted variant and display wiring | AC-7, AC-8, AC-12 | T-04, T-05 |
| ✅ 2026-11-09 [T-07](tasks/T-07.md) | MarkCanvas, save, reset and cancel | AC-4, AC-5, AC-6, AC-14 | T-01, T-04, T-05, T-06 |
| ✅ 2026-11-09 [T-09](tasks/T-09.md) | Colours in the mark format (Rust validation + mark.ts) | AC-15 | T-07 |
| ✅ 2026-11-09 [T-10](tasks/T-10.md) | Canvas: WYSIWYG rendering, swatches and the repaint label | AC-8, AC-15, AC-16, AC-17 | T-09 |
| ✅ 2026-11-09 [T-08](tasks/T-08.md) | Interactive pass (manual) | AC-13 | T-07, T-10 |

## Definition of Done (every task)

- Tests from the task written first and green; `pnpm check` green (includes cargo test and clippy).
- Docs updated (spec/design/ADR if reality differs); `status.yaml` AC status updated; no task closed while the check is red.
- No secrets, no new dependency, no new image asset.
- Visible UI changes are confirmed in the running app by the user (the agent cannot screenshot).

## Out of this milestone

Everything in `backlog.md` (several marks, brush options, gallery, image export, pending-mood pulse).
