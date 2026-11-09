# Paint marks — design detail

Reference only; not required reading for approval.

## Storage (C-1, C-2)

Migration v3 (append-only, never edit v1/v2): `ALTER TABLE entries ADD COLUMN mark TEXT;`

Validation `validate_mark(s: &str) -> Result<(), String>` (provisional limits from spec D-6):

| Rule | Limit |
|------|-------|
| total byte length | ≤ 8192 |
| JSON parses to `{"v":1,"strokes":[[…],…]}`, no other keys | exact |
| strokes | 1..=8 |
| per stroke: numbers (even count, pairs x,y) | 2..=400 points, integers only |
| each coordinate | 0..=480 |
| optional `colors` (D-9) | array, same length as strokes, integers 0..=7; any other key is rejected |

`set_mark` also bumps nothing else (not `updated_at`, not `embed_status`, not `mood_*`): a mark is not text.
`clear_mark` sets NULL. Both return NotFound for a missing id.

Blank-draft statements in `export.rs` (restore) and the unlock cleanup become
`WHERE body='' AND mood_level IS NULL AND mark IS NULL AND id NOT IN (SELECT entry_id FROM entry_tags)`.

## Read paths (C-3, C-4)

`Entry`/`EntrySummary` SELECTs add `mark`. `calendar_month` selects `created_at, mood_level, mood_source, mark`
ascending; per local day, `mark` = the last row (ascending) whose `mark IS NOT NULL`, paired with that row's
`mood_level`. Existing `level` logic (manual first, else AI) is unchanged.

## Backup/restore (C-5)

`ExportEntry { …, #[serde(default)] mark: Option<String> }`. Backup `version` stays 1: adding an optional field
is readable by old and new code. Restore: `mark.filter(|m| validate_mark(m).is_ok())`, then INSERT with the new
column. Markdown export function untouched; its test asserts byte-identity on a marked entry (AC-10).

## Frontend (C-6..C-9)

`src/lib/mark.ts`:
- `type Stroke = number[]` (flat x,y in tenths); `encodeMark(strokes) -> string`; `decodeMark(s) -> Stroke[] | null` (null on any problem).
- `simplifyStroke(points, epsilon)` Ramer–Douglas–Peucker, used ONLY as the fallback when a stroke would exceed the point limit (the canvas thins points as they arrive instead, see below).
- `strokesToPath(stroke)` converts points to a smooth path using midpoint quadratic segments; a single point becomes a short dot-stroke.

`MoodMark` painted variant: same `<svg viewBox="0 0 48 48" data-mood=…>` shell, `data-painted="true"`,
`<g filter="url(#paint-s)">` with one `<path>` per stroke, stroke width 5 (confirmed in the T-01 spike), round caps; stroke colour = its swatch
(1 ink, 2 coral, 3 lavender, 4 sky, 5 green, 6 ochre, 7 blue) or, for swatch 0, `var(--mN)` / `var(--ink)` from the entry's mood; aria-label "painted mark (<mood name or no mood>)".

`MarkCanvas`: a 240×240 area, `touch-action:none`, `onPointerDown` (capture), `onPointerMove` (append, 1 unit
minimum distance), `onPointerUp`/`onPointerCancel` (close stroke). Live preview is a plain polyline; the
finished result is shown through `MoodMark` (so the preview matches what is saved). Buttons: Undo, Clear,
Save (disabled with 0 strokes or over limits), Cancel, Use default mark (only if a mark exists).
The canvas never touches the editor's textarea or autosave.

State of the canvas: closed → open-empty → drawing → open-with-strokes → (saved | cancel) → closed. Cancel with strokes shows an inline "Discard this drawing?" with Discard / Keep drawing (D-8); Cancel on an empty canvas closes immediately.

## Privacy (C-10)

Prompt builders (`prompt/`, `memory/mood.rs`, search answer) take explicit fields (body, tags, dates). A test
builds each prompt for an entry with a mark and asserts the prompt text contains neither `strokes` nor the
mark string.

## Security

No scripts or references can be stored (numbers only). IPC strings are length-checked before parsing.
Marks are inside the encrypted journal; backups follow the existing plain-JSON backup behaviour.

## Extension points (not built)

Several marks per entry (`v:2` with an array of marks), brush options, stamps, a gallery, image export.

## Canvas: what you draw is what you get (D-10)
The 240 px surface contains one `<svg viewBox="0 0 48 48">` rendered by the same `PaintedStrokes` component the final mark uses (smoothed path, `#paint-s`
filter, stroke width 5), so shapes scale identically. The stroke being drawn is thinned on arrival (a point is kept after the pointer moved `MIN_STEP` = 6 tenths) and smoothed with midpoint quadratics, so the part already drawn never changes as the stroke grows and what is shown equals what is kept on release. There is no
second preview and no thin guide line. The saved mark's path data must equal what the canvas showed (AC-16).

## Filter region
`#paint-s` uses `filterUnits="userSpaceOnUse"` with a fixed region (x=-12 y=-12 width=72 height=72 of the 48 box) so the marker texture does not depend on the stroke's bounding box (no shifting while drawing).

## Swatches and label (D-9, D-11)
Swatch row = buttons with `aria-pressed`, coloured by CSS variables; the chosen swatch applies to strokes drawn after it. The editor header shows a visible
caption under the mark: "paint your own" (no mark) / "repaint" (mark), inside the same button that opens the canvas.
