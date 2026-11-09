# Paint marks — spec

M2 of the painted UI (`docs/specs/paper-ui/`). Feature id `paint-marks`.

## 0. Review guide

**Summary:** Let the user paint their own mark for an entry with the pointer. The painted mark
**replaces** the default mood mark everywhere that entry's mark is shown (list, header, calendar,
legend stays default), is painted in colours the user picks (default: the entry's mood colour), is stored with the entry (new column), survives
backup/restore, and never reaches any AI provider.

**Review order:** Decisions → Scope (§4) → ACs (§6).

**Decisions**

| ID | Decision | Status |
|----|----------|--------|
| D-1 | A painted mark replaces the default mood mark everywhere that entry shows a mark; "reset" brings the default back | Decided: replaces it everywhere (2026-11-06) |
| D-2 | Creation = freehand drawing with pointer/trackpad on a small canvas; undo and clear; no shuffle in M2 | Decided: freehand (2026-11-06) |
| D-3 | ~~Colour = the entry's mood colour, fixed~~ | Superseded by D-9 (2026-11-09) |
| D-4 | Calendar day with several entries shows the painted mark of that day's most recent entry that has one, else the mood mark | Decided: latest painted mark of the day (2026-11-06) |
| D-5 | Markdown export stays unchanged (the mark is a drawing, not text); only the JSON backup carries it | Decided: JSON backup only (2026-11-06) |
| D-9 | Colour selection: a swatch row on the canvas; each stroke keeps the colour it was painted in. Swatch 1 = "mood colour" (the old rule: follows the entry's mood, ink if none) and is the default, so existing marks are unchanged. Palette: mood colour, ink, coral, lavender, sky, green, ochre, blue | Decided (2026-11-09) |
| D-10 | No separate preview: the canvas renders the real painted look while drawing (same smoothing, filter and stroke width as the final mark) | Decided (2026-11-09) |
| D-11 | A visible text label beside the mark tells the user it can be painted: "paint your own" with no mark, "repaint" with one | Decided (2026-11-09) |
| D-6 | Limits are provisional until measured: ≤ 8 strokes, ≤ 400 points per stroke after thinning, ≤ 8 KB stored | Decided as provisional (2026-11-06) |
| D-7 | On restore an invalid mark is dropped and the restore continues | Decided (2026-11-09) |
| D-8 | Cancel on the canvas with strokes asks "Discard this drawing?"; Cancel on an empty canvas just closes | Decided (2026-11-09) |

**Open risks:** (1) Pointer events in the Tauri webview (WKWebView) for smooth drawing must be proven on the real app. (2) A shaky trackpad line must still read as marker, depends on the existing paint filter. (3) Stored drawing size on long journals (57+ entries). (4) A painted mark must stay recognisable at 26 px in the calendar legend-sized cells.

**Prerequisites the user owns:** the final interactive pass (AC-13).

## 1. Problem

Every entry shows one of six fixed marks (five moods plus a ring). They are consistent but impersonal. The
user wants to paint their own mark for an entry so the journal feels hand-made.

## 2. Goals

- G-1 Painting a mark takes under a minute and needs no tool beyond the pointer — AC-5, AC-6.
- G-2 The painted mark is recognisable and looks marker-painted at every size — AC-7, AC-8, AC-12.
- G-3 Nothing is lost or leaked: stored, backed up, restored, never sent to AI — AC-1, AC-9, AC-11.
- G-4 Nothing that worked stops working — AC-10 and the existing suite (Definition of Done).

## 3. Data / reality

- Entries live in SQLCipher table `entries`; schema migrations are append-only (`v1`, `v2`; a new `v3` is needed). **[verified, src-tauri/src/storage/migrations.rs]**
- `Entry` and `EntrySummary` carry `mood_level/mood_label/mood_source`; they are mirrored in TypeScript `src/lib/types.ts`. **[verified]**
- JSON backup (`export.rs`, `ExportEntry`, backup `version: 1`) restores via serde; unknown/missing fields must not break old backups. **[verified for fields present; behaviour for an added optional field = assumption]**
- `calendar_month` returns `DayMood {date, level, count}` per day, not per entry. **[verified, types.ts]**
- The UI already has `MoodMark` and inline SVG paint filters (`#paint-s`, `#ink`). **[verified]**
- Mark and mood text never leave the machine except entry text to the chosen cloud provider; a mark is not text. **[assumption: keep it out of prompts]**

## 4. Scope — M2 milestone

**In:** a "Paint a mark" canvas in the editor header; strokes captured as thinned path data;
undo, clear, save, reset to default; storage (migration v3) and IPC; display in list, header,
calendar (so the calendar data carries the day's mark, D-4); colour selection per stroke (D-9); JSON backup/restore; privacy guard; keyboard-reachable reset.

**Out (backlog):** several marks per entry, stamps, brush options and pressure, a gallery, image export,
shuffle (D-2), custom colours beyond the palette, Markdown export (D-5).

## 5. Users and key flows

- **Paint:** open entry → click the mark in the header → canvas opens → draw → Save → mark appears everywhere for that entry.
- **Change mood:** strokes painted in "mood colour" take the new mood colour; strokes in a chosen colour keep it.
- **Reset:** "use default mark" → painted data removed → default mood mark returns.
- **Backup/restore:** Back up (JSON) includes marks; Restore brings them back; old backups restore with no marks.

## 6. Acceptance criteria

```
AC-1  Migration v3 is safe
  Given a v2 journal with entries and moods
  When  it is opened by the new version
  Then  every entry is intact, mark is empty for all, and a v3 journal opens unchanged
  Verify: auto

AC-2  Save a mark
  Given an entry
  When  set_mark(id, strokes) is called with valid strokes
  Then  get_entry and the entry list return that mark, and a later edit of the body keeps it
  Verify: auto

AC-3  Invalid or oversized marks are rejected
  Given strokes beyond the limits (D-6) or containing non-numeric/invalid path data
  When  set_mark is called
  Then  it fails with a clear error and the stored mark is unchanged
  Verify: auto

AC-4  Reset to default
  Given an entry with a painted mark
  When  the user chooses "use default mark"
  Then  the mark is cleared and the default mood mark shows again in every place
  Verify: auto

AC-5  Paint with the pointer
  Given the editor open on an entry
  When  the user opens the canvas, draws two strokes with pointer events and presses Save
  Then  the strokes are stored and the painted mark shows in the editor header
  Verify: auto

AC-6  Undo and clear before saving
  Given a canvas with three strokes
  When  the user presses Undo, then Clear
  Then  the last stroke is removed, then all strokes are removed, and nothing is stored until Save
  Verify: auto

AC-7  Painted mark replaces the default everywhere
  Given an entry with a painted mark
  When  the entry list, header and calendar render
  Then  each shows the painted mark in place of the default mood mark, identical markup in every place
  Verify: auto

AC-8  Colour rule
  Given strokes painted in "mood colour" and strokes painted in a chosen colour, on an entry at mood level 4, then 2, then no mood
  When  each state renders
  Then  "mood colour" strokes use --m4, then --m2, then the ink colour; chosen-colour strokes keep their colour in every state; the shape never changes
  Verify: auto

AC-9  Backup and restore keep marks
  Given entries with painted marks and an old backup file without the field
  When  Back up (JSON) then Restore, and when the old file is restored
  Then  marks round-trip exactly; the old file restores with no marks and no error
  Verify: auto

AC-10 Calendar and unrelated flows unchanged
  Given the calendar and the Markdown export (D-4, D-5)
  When  they run on entries with and without painted marks
  Then  calendar days follow the D-4 rule, the Markdown export is byte-identical to before for the same entries
  Verify: auto

AC-11 Marks never reach AI providers
  Given entries with painted marks
  When  a reflection, mood read, or search answer prompt is built for either provider
  Then  the prompt text contains no mark data
  Verify: auto

AC-12 Painted look, no image assets
  Given a painted mark rendered at 26, 34, 44 and 84 px
  When  inspected
  Then  it is an inline SVG using the existing paint filter, and no image file was added
  Verify: auto

AC-14 Cancel asks before discarding
  Given a canvas with at least one stroke
  When  the user presses Cancel
  Then  a "Discard this drawing?" choice appears; Discard closes with nothing stored, Keep drawing returns to the canvas; on an empty canvas Cancel closes at once
  Verify: auto

AC-15 Pick colours per stroke
  Given the canvas open
  When  the user picks a swatch and draws a stroke, then picks another swatch and draws another
  Then  each stroke is saved with its own colour, the swatch in use is marked pressed, and the saved mark shows both colours everywhere it appears
  Verify: auto

AC-16 What you draw is what you get
  Given the canvas open with strokes drawn
  When  the user looks at the canvas and then saves
  Then  the canvas already shows the smoothed, filtered, painted result (no separate preview), and the saved mark's paths are identical to what the canvas showed
  Verify: auto

AC-17 The label says it can be painted
  Given an entry with no mark, and an entry with a painted mark
  When  the editor header renders
  Then  a visible label reads "paint your own" for the first and "repaint" for the second, on the same control that opens the canvas
  Verify: auto

AC-13 Interactive pass
  Given the real app with the fixtures journal
  When  the user paints, saves, restarts, backs up and restores
  Then  the marks look hand-painted, are recognisable at list and calendar size, and survive each step
  Verify: manual
```

Keyboard: the canvas is pointer-only; "use default mark", Save, Cancel, Undo, Clear are real buttons
reachable by keyboard (covered by AC-4, AC-6, AC-5).

Provisional targets (measure first, not requirements): ≤ 8 strokes, ≤ 400 points per stroke, ≤ 8 KB stored
per mark; drawing latency feels immediate on a trackpad.

## 7. Non-functional requirements

- Drawing never blocks typing; the canvas is a separate surface, filters are only on the finished mark.
- Stored data is plain path data, no scripts or external references (reject anything else).
- No new runtime dependencies; no new image assets.
- Old journals and old backups keep working (AC-1, AC-9).

## 8. Assumptions

- One painted mark per entry (M3 may allow more).
- Strokes are stored as thinned point lists in a 48x48 box, rendered as smooth strokes.
- The mood still exists and is still editable; the mark is a presentation layer over it.

## Glossary

- **Painted mark** — the user's own drawing for an entry, replacing the default mood mark.
- **Default mark** — the fixed brush mark for a mood, or the ring (see paper-ui spec §6).
- **Stroke** — one continuous pointer-down to pointer-up line.
- **Swatch** — one colour button in the canvas palette; "mood colour" is the swatch that follows the entry's mood.
- **Canvas** — the small drawing surface opened from the editor header.
