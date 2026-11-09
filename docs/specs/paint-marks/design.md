# Paint marks — design

Read with `spec.md` §4–6. Diagrams: `diagrams/index.html` (from `diagrams/diagrams.md`). Schemas, validation
rules and algorithms: `design-detail.md` (reference only). ADR: `docs/adr/0006-mark-storage-format.md`.

Small backend change (one column, two commands, two read paths) plus a drawing component and a render prop.
No new dependency. The default marks, mood logic and AI paths are untouched.

## Components

| ID | Component | Job | Notes |
|----|-----------|-----|-------|
| C-1 | Migration v3 + storage (`migrations.rs`, `entries.rs`) | `entries.mark TEXT` null by default; `set_mark`, `clear_mark`; validated on write | Mark never touches `mood_*` columns |
| C-2 | Mark validation (`storage/mark.rs`) | Parse JSON, check version, stroke/point counts, integer range, byte size | Single function used by commands and restore |
| C-3 | IPC commands (`commands.rs`, `lib.rs`, `ipc.ts`) | `set_mark(id, mark)`, `clear_mark(id)` | Entry/EntrySummary/DayMood carry `mark` |
| C-4 | Calendar read path (`calendar.rs`) | Per local day, the latest entry's painted mark with that entry's mood level | D-4; mood rule for `level` unchanged |
| C-5 | Backup/restore (`export.rs`) | `ExportEntry.mark` optional; restore validates, drops invalid, keeps going | Markdown export untouched (D-5) |
| C-6 | Stroke library (`src/lib/mark.ts`) | simplify (only at the point limit), encode/decode JSON with optional colours, strokes → smooth SVG path | Pure functions, unit-tested |
| C-7 | `MoodMark` painted variant | Optional `mark` prop renders strokes with the same filter group; each stroke uses its swatch colour, or the mood colour/ink for swatch 0 | One source for list, header, calendar; exports `PaintedStrokes` used by the canvas too |
| C-8 | `MarkCanvas` | Pointer-event drawing surface that renders the real painted result live (no preview, D-10); swatch row (D-9); Undo, Clear, Save, Cancel (asks "Discard this drawing?" if strokes exist, D-8), Use default | Opens from the editor header |
| C-9 | Wiring (`Editor`, `EntryList`, `Calendar`, `App`) | Pass `mark` through, refresh list/calendar after save/clear | Legend and mood picker stay default |
| C-10 | Privacy guard | Prompt builders never read `mark` | Test over reflection, mood, search prompts |

## Key flows

- **Paint:** open canvas → pointer strokes → Save → `set_mark` → refresh list → mark shows everywhere. Diagram: *Paint and save*.
- **Reset:** "Use default mark" → `clear_mark` → default mood mark returns.
- **Mood change:** mark data untouched; only the colour token changes (rendering rule).
- **Backup/restore:** `ExportEntry.mark` string round-trips; invalid or missing → no mark.
- **Calendar:** each day carries `{strokes, level}` of its latest painted entry, else none (use mood mark).

## Contracts

| Where | Field | Type | Meaning |
|-------|-------|------|---------|
| DB | `entries.mark` | TEXT null | JSON `{"v":1,"strokes":[[x,y,…],…],"colors":[0..7,…]?}`, ints 0..=480, optional per-stroke colours (ADR-0006 addendum) |
| IPC | `set_mark(id, mark)` | string | validated; error string on reject |
| IPC | `clear_mark(id)` | — | sets null |
| `Entry`, `EntrySummary` | `mark` | string or null | as stored |
| `DayMood` | `mark` | `{mark: string, level: number or null}` or null | D-4 |
| `MoodMark` props | `{level, size?, mark?: string or null}` | | `mark` wins over the default drawing |

## Tricky parts

- **Blank-draft cleanup:** two SQL statements treat `body='' AND mood_level IS NULL` as an empty draft; they must also require `mark IS NULL` or a painted empty entry would be deleted on unlock/restore.
- **Pointer events in WKWebView:** use `setPointerCapture` and `touch-action: none`; the T-01 spike proved it in the real window (no coalesced events needed).
- **Shaky lines:** points are thinned as they arrive (a point is kept once the pointer moved 0.6 box units), so the line already drawn never changes while the stroke grows; quadratic smoothing on top; the `paint-s` filter has a fixed user-space region so its texture does not shift. Ramer–Douglas–Peucker is only the fallback for a stroke that would exceed the point limit.
- **Identical markup at every size:** the painted variant uses the same 48×48 box and `<g filter>` as default marks (AC-7, AC-12).
- **Untrusted stored data:** the UI must treat a bad `mark` string as "no mark" (parse errors never break rendering).
- **Calendar mood rule is separate:** `level` stays "manual first, then AI"; `mark.level` is the painted entry's own mood.

## Failure modes

| Failure | Effect | Mitigation |
|---------|--------|------------|
| Mark exceeds limits | Save rejected, message shown | Backend validation (C-2), canvas disables Save at limits |
| Corrupt/hand-edited `mark` in DB or backup | No mark shown | Client parse returns null; restore drops invalid |
| Old backup without field | Restores with no marks | `#[serde(default)]` |
| Pointer capture lost mid-stroke | Stroke ends early | Treat `pointercancel` as `pointerup` |
| Reduced motion | No effect | The canvas has no animation |

## Technology

CSS/SVG, React state, Pointer Events, serde_json (already a dependency). No new dependency. One ADR: 0006 (Accepted).

## AC coverage

| AC | Component/flow |
|----|----------------|
| AC-1 | C-1 |
| AC-2 | C-1, C-3 |
| AC-3 | C-2 |
| AC-4 | C-1, C-3, C-9 (reset flow) |
| AC-5 | C-8, C-6 |
| AC-6 | C-8 |
| AC-7 | C-7, C-9, C-4 |
| AC-8 | C-7 |
| AC-9 | C-5 |
| AC-10 | C-4, C-5 |
| AC-11 | C-10 |
| AC-12 | C-7, C-6 |
| AC-13 | all (manual) |
| AC-14 | C-8 |
| AC-15 | C-8, C-2, C-6, C-7 |
| AC-16 | C-8, C-7 |
| AC-17 | C-9 (Editor header) |

## Questions to answer before approving this design

- [x] ADR-0006: strokes as JSON numbers in one nullable column — Accepted 2026-11-09
- [x] Numbers-only format instead of SVG path text — yes (2026-11-09)
- [x] On restore drop an invalid mark and continue (D-7, 2026-11-09)
- [x] First task is a spike proving pointer drawing in the real Tauri window (2026-11-09)
