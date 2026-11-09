# paint-marks — verify

Verified 2026-11-09. Verdict: **pass with follow-ups** (one UX gap, accepted into the backlog).

## Run (this session)

`pnpm check`: exit 0. 11 frontend test files, **163 tests passed**; `tsc` clean; `vite build` ok; Rust **72 passed, 0 failed, 5 ignored** (live-Ollama tests, need `OLLAMA_TEST=1`); `clippy -D warnings` clean. The frontend suite was also run 3 times in a row after the last change with no failure.

## Results

| AC | Test(s) | Result | Evidence |
|----|---------|--------|----------|
| AC-1 migration v3 safe | TC-1 `pm_tc1_v2_journal_migrates_to_v3`, TC-2 `pm_tc2_v3_journal_reopens_unchanged` | pass | cargo test |
| AC-2 save a mark | TC-3 `pm_tc3_save_and_read_a_mark`, TC-4 `pm_tc4_a_mark_is_not_text` | pass | cargo test |
| AC-3 invalid/oversized rejected | TC-5 `tc5_validation_rules` + `pm_tc5_invalid_mark_is_rejected_and_stored_mark_kept`, TC-22 `pm_tc22_colour_rules` | pass | cargo test |
| AC-4 reset to default | TC-6 `pm_tc6_clear_a_mark`, TC-7 "use default mark" (MarkCanvas.test) | pass | cargo + vitest |
| AC-5 paint with the pointer | TC-8 paint a mark, TC-9 `mark.test.ts` | pass | vitest |
| AC-6 undo and clear | TC-10 | pass | vitest |
| AC-7 replaces everywhere | TC-11 identical painted mark in list, header, calendar | pass | vitest |
| AC-8 colour rule | TC-13, TC-24 | pass | vitest |
| AC-9 backup/restore keep marks | TC-14 `pm_tc14_backup_restore_keeps_marks`, TC-15 `pm_tc15_painted_empty_entry_is_not_a_blank_draft` | pass | cargo test |
| AC-10 calendar and Markdown | TC-12 `pm_tc12_day_carries_latest_painted_mark`, TC-16 `pm_tc16_markdown_export_ignores_marks` | pass | cargo test |
| AC-11 never reaches AI | TC-17 `pm_tc17_marks_never_reach_prompts` (mutation-checked in T-04) | pass | cargo test |
| AC-12 painted look, no image assets | TC-18 + `paintedUi.test.ts` image list | pass | vitest |
| AC-13 interactive pass | TC-19 / checklist below | **manual-ok** | user confirmed on 2026-11-09 ("done, all good") |
| AC-14 cancel asks | TC-20 | pass | vitest |
| AC-15 colour per stroke | TC-22, TC-23, TC-25 | pass | cargo + vitest |
| AC-16 what you draw is what you get | TC-26 | pass | vitest |
| AC-17 label | TC-27 | pass | vitest |
| spike (T-01) | TC-21 | manual-ok | user-confirmed smooth drawing in the real window |

Also covered beyond the ACs: "no shaking while drawing" (3 tests), fixed filter region (static test), blank-draft cleanup, old backup without the field.

## Measurements (synthetic drawings; real strokes are on the user's machine)

| What | Result |
|------|--------|
| Stored size, circle radius 15 box units | 155 points, 1226 bytes |
| Circle radius 8 | 85 points, 701 bytes |
| Wave across the canvas | 191 points, 1513 bytes |
| Long scribble | 501 points before the limit fallback (the canvas then loosens to <= 400), about 4 KB |
| Large circles that fit under 8 KB | 6 (the 7th reaches 8468 bytes) |
| Strokes / points used by normal drawings | 1-4 strokes, 85-200 points each: the 8-stroke and 400-point limits are generous; the 8 KB limit is the one a very detailed drawing hits first |
| Point-thinning step (0.6 box units) | feels smooth per the user; no change requested |
| Drawing latency in the real window | smooth per the user (spike and later builds) |

Limits (8 strokes, 400 points, 8 KB) stay as provisional numbers; nothing measured argues for changing them.

## Drift check

Fixed in this verify: `design.md` / `design-detail.md` / `spec.md` / `tests.md` still described simplifying on release (Ramer-Douglas-Peucker, epsilon 0.8) and coalesced pointer events; the code thins points as they arrive (0.6 box units) and only uses RDP as the fallback at the point limit. Also documented the fixed `#paint-s` filter region. Names, commands (`set_mark`, `clear_mark`), the `mark` field, `DayMood.mark`, `PaintedStrokes` and ADR-0006 (with its colour addendum) match the code. README has no paint-marks text to update.

## Scope

Nothing from `backlog.md` was implemented (several marks, brush options, gallery, image export, pending-mood pulse). Colour selection was added by the user's explicit request (spec D-9, superseding D-3), with its own ACs; custom colours beyond the 8 swatches stay out.

## Findings

| # | Finding | Decision |
|---|---------|----------|
| F-1 | When a drawing exceeds the 8 KB size limit, Save is disabled with no explanation (verified: 4 long zig-zag strokes). The design said "message shown". A normal drawing never gets near it. | Accepted as a follow-up; moved to `backlog.md` (user, 2026-11-09) |
| F-2 | Stroke width looks thicker on the large canvas than in the small header mark. Measured: it is 10-11% of the mark's size at 236/84/44/34 px, so proportionally identical; only the canvas is ~3x larger. | No change (user chose to keep the same ratio) |

## Interactive pass checklist (AC-13) — confirmed by the user 2026-11-09

- [x] Canvas opens from the mark; drawing is smooth; no separate preview; the canvas looks like the result
- [x] Save shows the painted mark in the header and the list; the calendar shows the day's latest painted mark
- [x] Colours per stroke; the mood change recolours only "mood colour" strokes
- [x] Undo, Clear, Cancel (with the discard question), Use default mark
- [x] The label "paint your own" / "repaint" is visible
- [x] Marks survive a restart and a backup/restore
