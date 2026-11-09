# paint-marks — tests

## Test data

- Rust: temp SQLCipher journals built in each test (pattern: `storage/mod.rs` v1->v2 migration test). Valid mark fixture: a two-stroke JSON `{"v":1,"strokes":[[10,10,240,300,470,40],[20,400,260,260]]}`; bad cases generated in `storage/mark.rs` tests.
- Old-backup fixture: `src-tauri/tests/fixtures/journal-backup.json` (no mark field, exists today); damaged-backup fixture built in the test from it.
- Frontend: `src/test/fakeIpc.ts` gains `setMark`/`clearMark` and entries/days with marks; pointer events are fired by hand (`pointerdown/move/up`) on the canvas element.
- No network, no fonts, no images in any test. jsdom: also dispatch `webkitAnimationEnd` if an animation is ever asserted (not needed here).

## Cases

| ID | AC | Level | Case (Given / When / Then) | File |
|----|----|-------|------|------|
| TC-1 v2 journal migrates to v3 | AC-1 | unit | Given a v2 journal with entries, tags and moods, when it is opened by the new version, then every entry, tag and mood is intact and every entry's mark is null. | src-tauri/src/storage/mod.rs |
| TC-2 v3 journal reopens unchanged | AC-1 | unit | Given a v3 journal with a painted mark, when it is closed and reopened, then the schema version stays 3 and the mark is unchanged. | src-tauri/src/storage/mod.rs |
| TC-3 Save and read a mark | AC-2 | unit | Given an entry, when set_mark(id, valid_json) is called, then get_entry, list_entries and save_entry(id, new body) run, then get_entry and the list return that exact mark and the body save keeps it. | src-tauri/src/storage/mod.rs |
| TC-4 A mark is not text | AC-2 | unit | Given an entry with a mood, body, updated_at and embed_status, when set_mark is called, then mood_*, body, updated_at and embed_status are unchanged. | src-tauri/src/storage/mod.rs |
| TC-5 Validation rules | AC-3 | unit | Given mark strings: more than 8 strokes, a stroke over 400 points, an odd coordinate count, a coordinate below 0 or above 480, a fractional number, wrong version, an extra key, over 8192 bytes, not JSON, plus one valid mark, when validate_mark and then set_mark run on each, then the invalid ones fail with an error and the stored mark is unchanged, the valid one passes. | src-tauri/src/storage/mark.rs |
| TC-6 Clear a mark | AC-4 | unit | Given an entry with a painted mark and a mood, when clear_mark(id) is called, then the mark is null, the mood is unchanged, and get_entry shows no mark. | src-tauri/src/storage/mod.rs |
| TC-7 Use default mark | AC-4 | integration | Given an entry with a painted mark and mood 4, when the user presses 'Use default mark' in the canvas, then clear_mark is called and the list, header and calendar show the default mood-4 mark again. | src/MarkCanvas.test.tsx |
| TC-8 Paint with the pointer | AC-5 | integration | Given the editor open on an entry, when the user opens the canvas, draws two strokes with pointer events and presses Save, then set_mark is called once with valid JSON holding two strokes and the header shows the painted mark. | src/MarkCanvas.test.tsx |
| TC-9 Stroke library | AC-5 | unit | Given pointer point lists including a noisy line, a single tap and a closed loop, when simplify, encodeMark, decodeMark and strokesToPath run, then noise is reduced, coordinates are integers 0..480, decode(encode(x)) equals x, bad strings decode to null, a tap becomes a dot path. | src/lib/mark.test.ts |
| TC-10 Undo and clear | AC-6 | integration | Given a canvas with three strokes, when the user presses Undo, then Clear, then the last stroke is removed, then all are removed, Save is disabled with no strokes and set_mark was not called. | src/MarkCanvas.test.tsx |
| TC-11 Painted mark is identical everywhere | AC-7 | integration | Given an entry with a painted mark and a calendar day carrying the same mark, when the entry list, editor header and calendar render, then each shows the painted mark (data-painted=true) with identical path markup in place of the default mark. | src/MoodMark.painted.test.tsx |
| TC-12 Calendar day mark (D-4) | AC-10 | unit | Given a day with entry A (manual mood 5, no mark), entry B (mood 2, painted, earlier) and entry C (no mood, painted, latest), when calendar_month runs, then the day's mark is C's mark with C's level (null), the day's mood level is still 5 (manual first), and a day with no painted entry has mark null. | src-tauri/src/storage/calendar.rs |
| TC-13 Mood colour rule | AC-8 | unit | Given a painted mark on an entry at mood 4, then 2, then no mood, when each state renders, then the strokes use var(--m4), then var(--m2), then var(--ink), and the path data is identical in all three. | src/MoodMark.painted.test.tsx |
| TC-14 Backup and restore keep marks | AC-9 | unit | Given entries with painted marks, an old backup file without the field, and a backup whose one mark is invalid, when Back up (JSON) then Restore, and restore the old and the damaged files, then marks round-trip exactly, the old file restores with no marks and no error, the damaged one restores everything with that single mark dropped. | src-tauri/src/export.rs |
| TC-15 Painted empty entry is not a blank draft | AC-9 | unit | Given an empty-body entry with no mood and a painted mark, and a truly blank draft, when the restore cleanup and the unlock cleanup run, then the painted entry survives and the blank draft is removed. | src-tauri/src/export.rs |
| TC-16 Markdown export unchanged | AC-10 | unit | Given two identical entries, one with a painted mark, when export_markdown runs for each, then both files are byte-identical apart from the id/date and contain no mark data. | src-tauri/src/export.rs |
| TC-17 Marks never reach prompts | AC-11 | unit | Given an entry with a painted mark, when the reflection, mood-read and search-answer prompts are built for the local and the cloud provider, then the prompt text contains neither the mark string nor the word 'strokes'. | src-tauri/src/prompt/mod.rs |
| TC-18 Painted look, no image assets | AC-12 | unit | Given a painted mark rendered at 26, 34, 44 and 84 px, and the repo, when they render and a static test lists images, then each is an inline svg with the paint filter group and the same path markup, and no image file was added. | src/MoodMark.painted.test.tsx, src/lib/paintedUi.test.ts |
| TC-19 Interactive pass | AC-13 | manual | Given the real app with the fixtures journal, when the user paints, saves, restarts, backs up and restores, then the marks look hand-painted, are recognisable at list and calendar size, and survive each step. | manual |
| TC-20 Cancel asks before discarding | AC-14 | integration | Given a canvas with at least one stroke, and an empty canvas, when the user presses Cancel on each, then with strokes a 'Discard this drawing?' choice appears (Discard closes with nothing stored, Keep drawing returns), the empty canvas closes at once. | src/MarkCanvas.test.tsx |
| TC-21 Spike: drawing in the real window | AC-5 | manual | Given pnpm tauri dev on macOS (WKWebView), when the user draws strokes with the trackpad on the spike canvas, then strokes follow the pointer smoothly with no gaps, the painted result looks like marker, and typing elsewhere is not slowed. | manual |
| TC-22 Colours validated (Rust) | AC-15 | unit | Given marks with optional colors: valid list, wrong length, value 8, negative, fractional, non-array, and an unknown extra key, when validate_mark runs, then valid colours and a mark without colors pass; every invalid one is rejected and the stored mark is unchanged. | src-tauri/src/storage/mark.rs |
| TC-23 Colours in the stroke library | AC-15 | unit | Given strokes with colors [0,3], colors all zero, and bad colors, when encodeMark and decodeMark run, then colors are encoded only when some are non-zero, decode returns strokes and colors (default zeros), bad colors decode to null. | src/lib/mark.test.ts |
| TC-24 Colour rule with chosen colours | AC-8 | unit | Given a painted mark with colors [0,4] on an entry at mood 4, then 2, then no mood, when each state renders, then stroke 1 uses --m4, then --m2, then ink; stroke 2 uses the sky colour in all three; path data identical. | src/MoodMark.painted.test.tsx |
| TC-25 Pick a colour per stroke | AC-15 | integration | Given the canvas open, when the user draws a stroke on 'mood colour', picks the coral swatch, draws, picks sky, draws, and saves, then set_mark receives colors [0,2,4], the pressed swatch is marked aria-pressed, and the header mark shows the colours. | src/MarkCanvas.test.tsx |
| TC-26 What you draw is what you get | AC-16 | integration | Given the canvas open with two strokes drawn, when the user inspects the canvas and then saves, then there is no separate preview, the canvas svg uses the paint filter group, and its path data equals the path data of the saved mark in the header. | src/MarkCanvas.test.tsx |
| TC-27 The label says it can be painted | AC-17 | integration | Given an entry with no mark and an entry with a painted mark, when the editor header renders, then a visible label reads 'paint your own' for the first and 'repaint' for the second, inside the control that opens the canvas. | src/MarkCanvas.test.tsx |

## Manual checklist (AC-13, spike)

- [ ] Spike: strokes follow the trackpad smoothly in the real window (TC-21)
- [ ] Paint a mark, save, see it in header, list and calendar (TC-19)
- [ ] Change the mood: same shape, new colour; reset brings the default back
- [ ] Restart the app: the mark is still there
- [ ] Back up, restore into an empty journal: marks come back
- [ ] The painted mark is recognisable at list and calendar size and looks like marker, not a thin line
- [ ] Cancel with strokes asks; Cancel on an empty canvas just closes
- [ ] The canvas shows the painted look while drawing (no separate preview) and the saved mark looks the same
- [ ] Pick different swatches: each stroke keeps its colour in header, list and calendar
- [ ] The label under the mark says "paint your own" / "repaint" and is clearly visible

## Measurements (not pass/fail yet)

| What | How |
|------|-----|
| Stored size per typical mark (limit 8 KB, provisional) | log byte length of 20 real drawings |
| Strokes and points actually used (limits 8 / 400, provisional) | same drawings |
| Point-thinning step (`MIN_STEP`, now 0.6 box units) | compare drawings with different values on screen |
| Drawing latency on trackpad | feel in the real app (spike), DevTools performance if it lags |
