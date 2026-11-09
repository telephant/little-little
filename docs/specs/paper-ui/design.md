# Painted UI — design

Read with `spec.md` §4–7. Diagrams: `diagrams/index.html` (from `diagrams/diagrams.md`). Tokens,
paths and filter recipes: `design-detail.md` (reference only). Mockup: `mockup/homepage.html`
(published artifact; earlier directions archived beside it).

Frontend only. **No Rust, IPC or schema change.** The backend `PanelState`, mood fields and
test ids are untouched; everything here is presentation plus a small reflection state machine.

## Components

| ID | Component | Job | Notes |
|----|-----------|-----|-------|
| C-1 | Token layer (`App.css :root`) | Colours (ink, blue, marker pigments `--m1..m5`, coral/ochre/green/lavender/sky), type roles, motion durations | Light only; replaces sage/cream tokens and `--mood-*` |
| C-2 | Font files (`src/assets/fonts`) | Walter Turncoat (titles), Spectral (reading), bundled with `@font-face` | Offline; no CDN (privacy). each font's licence file shipped (Spectral OFL, Walter Turncoat Apache 2.0) |
| C-3 | Paint filters (`<svg>` defs in `index.html`) | `paint-a/b/c/s` (uneven marker coverage), `wash` (watercolour), `line`/`linev` (wobbly rules), `ink` (ring) | Applied only to decorative pseudo-elements and mark SVGs |
| C-4 | Mood marks (`MoodMark.tsx`) | Renders the default mark for level 1–5 or the open ring for none | Single source used by list, calendar, picker, legend, header, onboarding art |
| C-5 | Reflection lifecycle | `arriving → present → dissolving → tucked`; recall re-enters `arriving` with the same text | State beside `panel` in `App.tsx`; linger counter on editor input |
| C-6 | Motion system | drift-in, dissolve, brush-in (list), mark hover, pop (notes) | opacity/transform only; reduced-motion variant |
| C-7 | Memories control | "N memories" text link; hover/focus/click reveals notes with a mood-coloured bar | Independent of the reflection phase |
| C-8 | Shell + screens restyle | Everything in the spec §5 replacement map R-1..R-18 | Class names and `data-testid`s kept |
| C-9 | Mockup | Design tool only; not shipped | 6 views: journal, calendar+settings, search, onboarding, lock |

## Key flows

- **Write → reflect:** save-settle → panel `ready` → bloom drifts in → user keeps writing past the
  linger threshold → bloom dissolves → "bring it back" recalls it. Diagram: *Reflection lifecycle*.
- **Mood:** AI sets a level (or none) → marks in list/calendar/header update → user picks a mark in
  the picker → manual, permanent, hint disappears. Diagram: *Mood marks*.
- **Memories:** hover/focus "N memories" → notes appear → leave/Esc → hide.
- **Cloud:** unchanged behaviour; the dialog and badge are restyled (R-14, R-16).

## Contracts

No backend contract changes. New frontend state in `App.tsx`:

| Field | Type | Meaning |
|-------|------|---------|
| `reflectionPhase` | `'arriving' \| 'present' \| 'dissolving' \| 'tucked'` | drives classes + recall |
| `keysSinceArrival` | `number` | linger counter, reset on `arriving` |
| `memoriesOpen` | `boolean` | notes revealed |

`MoodMark` props: `{ level: 1|2|3|4|5|null; size?: number }`. `null` renders the open ring.
Mood mark → colour token map: 1 coral, 2 lavender, 3 sky, 4 green, 5 ochre (`--m1..m5`).

## Tricky parts

- **Webview parity:** filters were proven in Chrome only. First task renders the marks, wash and
  rules in the real Tauri webview (WKWebView on macOS); fallback is flat colour with no filter.
- **Filter cost:** lists can be long. Entry/calendar marks are tiny single-filter SVGs; the heavy
  `wash` filter appears only on the reflection and answer. No filter ever wraps the textarea.
- **Exit animation:** the reflection must stay mounted through `dissolving` and unmount on
  `animationend` (with a timeout fallback).
- **Numerals:** Walter Turncoat's `1` looks like `I`; dates stay readable by context; review in AC-16.
- **Contrast:** washes are light; text is ink; check body text on the wash.
- **Tests:** jsdom has no animations; tests assert classes and fire `animationend` by hand.

## Failure modes

| Failure | Effect | Mitigation |
|---------|--------|------------|
| Filter unsupported or very slow | Flat colour marks/rules | Feature-detect, drop filters via a class |
| `animationend` never fires | Stuck `dissolving` | Timeout = duration + 150 ms |
| Font file missing | Fallback serif/cursive | Fallback stacks; AC-2 test |
| Reflection arrives while typing | Would appear then vanish | If editor is hot, go straight to `tucked` |
| Mood is a free-text label only | No level to map | Show the ring; label text still shown |

## Technology

CSS, inline SVG, React state, two static font files. No new dependencies. No ADR needed: every
choice is reversible styling; the hard product decisions are D-1..D-10 in the spec.

## AC coverage

| AC | Component/flow |
|----|----------------|
| AC-1 | C-1 |
| AC-2 | C-2 |
| AC-3 | C-3 |
| AC-4 | C-8 (R-1..R-17) |
| AC-5 | C-4 |
| AC-6 | C-4 |
| AC-7 | C-4 + mood flow |
| AC-8 | C-5, C-6 |
| AC-9 | C-5 |
| AC-10 | C-5 |
| AC-11 | C-6 |
| AC-12 | C-7 |
| AC-13 | C-3, C-8 (R-2) |
| AC-14 | C-8 (R-10, R-16) |
| AC-15 | all |
| AC-16 | all (manual) |

## Questions to answer before approving this design

- [x] Direction, fonts, mood marks and scope (D-2, D-7, D-8, D-9, D-10) decided by the user (2026-11-06)
- [x] Replacement map reviewed against the code: 9 components, 5 screens, shell, tokens, tests
- [x] Does the real Tauri webview render the filters acceptably? Yes (T-01, 2026-11-06)
- [x] Is the 16-AC size acceptable, or should M1 be split into "tokens + journal" and "other screens"?
