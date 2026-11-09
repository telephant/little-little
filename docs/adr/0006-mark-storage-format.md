# ADR-0006 — Painted mark storage format

Status: **Accepted 2026-11-09**

## Context
The painted-marks feature (spec `docs/specs/paint-marks/`) stores one freehand drawing per entry inside the
SQLCipher journal. It must survive backup/restore, validate cheaply on the Rust side, render in 26–84 px
SVG, and never leak into AI prompts. Schema migrations are append-only (ADR-0001 line of work).

## Options
1. **Nullable `entries.mark TEXT` holding JSON strokes** — `{"v":1,"strokes":[[x,y,x,y,...],...]}`, integers 0..=480 (a 48×48 box in tenths). Rendered client-side to smooth SVG paths.
2. Store ready-made SVG path strings (`d="M… Q…"`) — renders directly, but validating arbitrary SVG path syntax in Rust is larger and riskier (injection surface).
3. Separate table `entry_marks(entry_id, …)` — normalised, but one mark per entry makes a join pointless.
4. Store a raster (PNG blob) — simple to show, but not crisp at all sizes and conflicts with "no image assets".

## Decision (recommended)
Option 1. Numbers-only JSON is trivial to validate (parse, count, range, byte size), has no executable or
referencing syntax, round-trips through the JSON backup as a plain string, and is renderer-independent
(the path style can change later without a migration). Version field `v` allows future formats.

## Consequences
- Migration v3: `ALTER TABLE entries ADD COLUMN mark TEXT;` (null = no painted mark).
- Backend validates on every write and on restore (invalid mark on restore → dropped, restore continues).
- Frontend owns simplification and path generation (`src/lib/mark.ts`).
- Changing the stroke format later = bump `v` and add a reader, no schema change.

## Addendum 2026-11-09 — per-stroke colour (spec D-9)
The format gains an OPTIONAL key: `{"v":1,"strokes":[[...],...],"colors":[c0,c1,...]}` where `colors` has one integer 0..=7 per stroke
(0 = follow the entry's mood colour, 1..=7 = ink, coral, lavender, sky, green, ochre, blue). Marks without `colors` (everything saved so far)
stay valid and mean "all strokes follow the mood colour". Still numbers-only and version `v:1` because the change is additive; the validator
accepts exactly the keys `v`, `strokes` and optionally `colors`.
