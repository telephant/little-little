# Painted UI — design detail

Reference only; not required reading for approval. Source of truth for visuals is the mockup file
`mockup/homepage.html` until implemented.

## Tokens (C-1)

| Token | Value | Use |
|-------|-------|-----|
| `--white` | #ffffff | page |
| `--ink` / `--ink-soft` / `--ink-muted` | #1b1a1f / #57535c / #8e8993 | text, labels, hints |
| `--cobalt` | #2f6fc4 | blue rule, active link, sources |
| `--sky` | #7fb0e2 | okay mark, blue wash |
| `--lav` | #a08ad3 | low mark, wash accent |
| `--coral` | #e57a6b | rough mark, underline accent |
| `--green` | #4a9b72 | good mark, local dot |
| `--ochre` | #d2b548 | great mark |
| `--m1..--m5` | coral, lav, sky, green, ochre | mood colours (level 1..5) |
| `--wash-sky` / `--wash-lav` | rgba(127,176,226,.42) / rgba(160,138,211,.26) | reflection and answer wash |
| `--hair` | rgba(27,26,31,.16) | hairline separators |
| `--display` | Walter Turncoat, uppercase, tracking .14em, scale .8 | titles, dates, tags, small notes |
| `--serif` | Spectral | writing, previews, reflection, notes |
| `--sans` | system | small-caps labels and links |

Old tokens (`--bg`, `--bg-panel`, `--accent`, `--border`, `--mood-1..5`) are removed. The dark
media query is removed.

## Fonts (C-2)

`@font-face` from `src/assets/fonts/*.woff2` (Walter Turncoat 400; Spectral 400, 500, italic 400).
Spectral is OFL, Walter Turncoat is Apache 2.0 **[verified T-02]**; both licence files ship in `src/assets/fonts/`. Titles: `text-transform: uppercase;
letter-spacing: .14em; font-size: calc(Xrem * .8)` because the font runs larger than Spectral.

## Paint filters (C-3)

Defined once in an inline `<svg width=0 height=0>` in `index.html`; referenced by `filter:url(#id)`.

| Id | Recipe | Used for |
|----|--------|----------|
| `paint-s` | turbulence .07 -> displacement 3.4 -> streak alpha (.05 .5 freq) | mood marks, small dots |
| `paint-a/b/c` | turbulence -> displacement 4-9 -> streak alpha (.012 .2, .2 .02, .09) | note bars, link underlines, active-row wash |
| `wash` / `wash2` | turbulence .011 -> displacement 34 -> blur 1.4 -> blotchy alpha | reflection and answer |
| `linev` | turbulence .04 -> displacement 4.5 -> streak alpha (.03 .3) | black and blue column rules |
| `line` | turbulence .05 -> displacement 2.5 | underlines, today ring |
| `ink` | turbulence .07 -> displacement 2.6 | the no-mood ring |

Rule: filters only on pseudo-elements or on mark SVGs, never on text or the textarea. Mockup dials
(not shipped): stroke unevenness, wash looseness, linger, drift, dissolve.

## Mood marks (C-4)

48x48 viewBox, strokes round-capped, `paint-s` on the group; ink fleck = r 2.1 circle in `--ink`.

| Level | Strokes (path, width, opacity) | Fleck |
|-------|-------------------------------|-------|
| 1 rough, `--m1` | `M9 11 Q22 26 39 38` 11 .95; `M11 38 Q26 24 37 10` 9 .62 | dot (14,14) |
| 2 low, `--m2` | `M8 17 Q24 44 40 19` 11 .95; `M14 11 Q24 16 34 11` 7 .6 | line `M16 37 q8 3 16 0` |
| 3 okay, `--m3` | `M8 20 Q24 15 40 20` 10 .95; `M8 31 Q24 36 40 31` 10 .62 | dot (37,25.5) |
| 4 good, `--m4` | `M9 38 Q20 37 38 12` 11 .95; `M10 28 Q16 26 25 16` 7 .6 | dot (36,31) |
| 5 great, `--m5` | `M24 40 Q23 24 25 8` 11 .95; `M13 38 Q10 26 8 14` 8 .72; `M35 38 Q38 26 40 14` 8 .72 | dot (24,5) |
| none | open ring `M24 9 A15 15 0 1 1 19.5 9.7`, stroke `--ink` 3.2, `ink` filter, no colour | none |

Sizes: list 48, calendar 34-38, picker 34 (selected = full opacity + blue underline, others .5),
header 84, legend 26, onboarding row 64, lock ring 110.

## Reflection lifecycle (C-5)

| From | Event | To | Side effect |
|------|-------|----|-------------|
| none | panel `ready`, editor idle | arriving | `.arriving` drift-in |
| none | panel `ready`, editor hot | tucked | no animation, recall shown |
| arriving | `animationend` | present | rest |
| arriving / present | keystrokes >= linger (~14) | dissolving | `.dissolving` |
| dissolving | `animationend` or timeout | tucked | text kept, "bring it back" shown |
| tucked | recall | arriving | same text, no AI call |
| any | new `ready` | arriving (or tucked if hot) | old text discarded |
| any | dismiss | none | existing dismiss IPC |

## Component states to restyle (R-4, R-5, R-10, R-14, R-15, R-16)

- Gate: first-run (choose passphrase + warning), locked, busy, error line.
- Onboarding: Ollama-not-running warning, two model selects, suggested-download buttons, pull
  progress (percent), Claude-CLI-missing guidance, Skip / Done.
- AiPanel: `models_not_chosen` (Choose models button), `thinking`, `nothing_to_relate`,
  `provider_unavailable` (reason text), `ready` (memories + reflection + Regenerate / Dismiss).
- Status chips: missing / busy (indexing N of M, reading moods, downloading %) / ready.
- Privacy badge: local vs cloud wording; activity dot busy/idle.
- Search: asking, answer + sources, answer failed note, hidden-count note, results, empty.
- Calendar: month header and nav, day with mood, day with entries and no mood, empty day, selected
  day's entry list with mood label.

## Testing notes

- jsdom: assert classes and `data-mood` attributes; dispatch `animationend` AND `webkitAnimationEnd` by hand (jsdom's React listens for the prefixed name; `fireEvent.animationEnd` misses);
  fake timers for the fallback; `matchMedia` mock for reduced motion.
- AC-1/AC-4: a vitest that greps `src/` for old tokens/classes and colour literals outside `:root`.
- AC-2: assert `@font-face` sources are relative files; run with network blocked in the manual pass.

## Security / privacy

No new IPC, storage or network. Fonts are local files. Mood and reflection text stay in memory as today.

## Extension points (not built)

Per-entry painted marks (store an SVG path with the entry, show it instead of the default mark);
a deeper ultramarine and vermilion accent set taken from the reference shots.
