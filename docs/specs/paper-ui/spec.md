# Painted UI — spec

Feature id stays `paper-ui` (folder name, history); the look is no longer paper. See D-2.

## 0. Review guide

**Summary:** Redraw the whole Little Little interface as hand-painted marker work on a plain
white page: black and blue painted borders, marker-capital titles (Walter Turncoat), Spectral for
reading, a fixed brush mark for each of the five moods and an open ring for "no mood", and an AI
reflection that drifts in like a watercolour wash and gently dissolves. M1 covers **every screen
and component** listed in §5. Mockup: `mockup/homepage.html` (published artifact, 6 views).

**Review order:** Decisions → Replacement map (§5) → Mood marks (§6) → ACs (§7).

**Decisions**

| ID | Decision | Status |
|----|----------|--------|
| D-1 | Reflections are ephemeral: drift in, linger while writing, dissolve after sustained typing (~14 keys), recallable | Decided (2026-11-06) |
| D-2 | Look: hand-painted marker + gouache on plain white, light theme only, no dark mode; supersedes the earlier paper/desk/notebook directions | Decided (2026-11-06) |
| D-3 | Iterate on an HTML mockup before touching app code | Decided (2026-11-06) |
| D-4 | Related memories are tucked behind a "3 memories" control, revealed on hover/focus/click | Decided (2026-11-06) |
| D-5 | Reference: Cristian Blesnoc's sketchbook shots (Sketchbook Scans 2026, GSK, SKB): palette, uneven colour, marker lettering | Decided (2026-11-06) |
| D-6 | Colours stay soft tints; no large black shapes | Decided (2026-11-06) |
| D-7 | No general icon set. Each mood has ONE fixed default brush mark; "no mood" has an open ink ring (§6) | Decided (2026-11-06) |
| D-8 | Fonts: titles Walter Turncoat in tracked capitals; reading text Spectral | Decided (2026-11-06) |
| D-9 | Scope of M1 is the whole app, not just the homepage | Decided (2026-11-06) |
| D-10 | Column borders are the painted black (left) and blue (right) wobbly rules | Decided (2026-11-06) |

**Open risks:** (1) SVG-filter effects must be proven in the real Tauri webview, not only
Chrome. (2) Filter cost on long entry lists. (3) Walter Turncoat's numeral 1 reads like a
capital I at small size. (4) Bundled fonts' licences: Spectral is OFL, Walter Turncoat is Apache 2.0 (both allow bundling; licence files shipped) **[verified T-02, google/fonts repo]**.

**Prerequisites the user owns:** the final interactive pass (AC-16).

## 1. Problem

The app works but looks like a generic two-pane web app. A private journal should feel
personal and calm, like a page someone drew on. AI reflections currently appear and stay like chat
output; they should feel like passing weather. Moods are five coloured dots with no identity.

## 2. Goals

- G-1 Every screen reads as one hand-painted system, not a web app — measured by AC-4, AC-13, AC-16.
- G-2 Every mood, including "no mood", has a recognisable default mark everywhere moods appear — AC-5, AC-6, AC-7.
- G-3 Reflections arrive and leave gently — AC-8 to AC-11.
- G-4 Nothing that worked stops working; nothing leaves the device — AC-2, AC-14, AC-15.

## 3. Data / reality

- Moods in the app: `mood_level` 1–5 (labels in `MoodPicker`: rough, low, okay, good, great),
  `null` = no mood (entry exists but unclassified); free-text `mood_label` (e.g. "proud"); source
  `ai` or `manual`; a manual pick is permanent. **[verified, src/components/MoodPicker.tsx, types.ts]**
- Calendar day class today is `mood-N` or `has-entries` (entries without mood). **[verified, Calendar.tsx:62]**
- Colours already come from tokens in `src/App.css`; mood colours are `--mood-1..5`. **[verified]**
- The Tauri CSP is `null` and the app loads no web fonts today. Both new fonts are Google Fonts,
  so they must be **bundled as local files** to keep the privacy promise. **[verified, tauri.conf.json]**
- Painted effects use inline SVG filters (`feTurbulence`, `feDisplacementMap`, `feColorMatrix`).
  Rendered and checked in desktop Chrome only. **[verified in Chrome; webview untested = assumption]**
- Current UI inventory: 1 shell, 3 screens plus gate/onboarding, 9 components (§5). **[verified]**

## 4. Scope — M1: the whole interface, restyled

**In:** everything in §5; the mood default marks (§6); the reflection lifecycle (lingering
dissolve, recall); bundled fonts; token + filter system; `prefers-reduced-motion`.

**Out (backlog):** painting your own mark per entry (needs storing a drawing with the entry); dark
mode; sounds; large black gouache art; changing any backend, IPC, or data behaviour.

## 5. Replacement map — every place that changes

Each row is replaced by the painted equivalent; behaviour and test ids stay.

| # | Place (file) | Today | After |
|---|--------------|-------|-------|
| R-1 | Tokens, body, fonts (`src/App.css`, `index.html`) | Sage/cream tokens, system sans, dark media query | Painted token set, light only, Walter Turncoat + Spectral bundled |
| R-2 | Shell (`App.tsx`, `.shell`, `.main-pane`, `.side-panel`) | Two panes with grey border | Top bar + three columns separated by painted black / blue rules |
| R-3 | View nav (Journal / Calendar / Search) | Button row | Small-caps text links with a brushed underline on the active view |
| R-4 | Gate (`screens/Gate.tsx`) first-run + locked, error, warning | Plain form | Lock screen: open ring, wordmark, underlined passphrase, solid Open |
| R-5 | Onboarding (`screens/Onboarding.tsx`) pickers, downloads, progress, Ollama warning, Skip/Done | Form with selects | Same steps in the painted style (mood marks as art, brushed progress bar) |
| R-6 | Entry list (`EntryList.tsx`) | Date + preview rows | Mood mark + marker date + preview; active row = soft blue wash; "New page" link |
| R-7 | Editor (`Editor.tsx`) | Textarea + meta row | Big marker date, mood mark beside it, Spectral text, mood and tag row at the foot |
| R-8 | Mood picker (`MoodPicker.tsx`) | Five coloured dots | Five default marks (§6), selected one underlined in blue, mood name, "AI guess" hint |
| R-9 | Tags (`TagRow.tsx`) | Pills with ×, add input | Marker-written `#tags`, "+ tag" text link |
| R-10 | AI panel (`AiPanel.tsx`): `models_not_chosen`, `thinking`, `nothing_to_relate`, `provider_unavailable`, `ready` | Cards in a grey column | Watercolour reflection, memories behind a control, quiet notes for the other four states |
| R-11 | Calendar (`screens/Calendar.tsx`) grid, header, day list | Cells coloured by mood | Each day shows its mood's default mark; ring for entries without mood; blank for no entry; legend |
| R-12 | Search (`screens/Search.tsx`) input, answer, sources, hidden note, results, placeholders | Input + list | Underlined search line, answer as a watercolour wash, results as notes with a mood-coloured bar |
| R-13 | Settings (`screens/Settings.tsx`) provider radios, on-device models, Your data buttons | Bordered fieldsets | Hairline-separated rows, text-link buttons, painted toggle |
| R-14 | Cloud dialog (`CloudConfirmDialog.tsx`) | Boxed modal | Painted-border dialog, same copy and two actions |
| R-15 | Status chips (`StatusChips.tsx`) | Grey pills | Small-caps text notes with the same wording and busy/ready states |
| R-16 | Privacy badge + activity dot (`PrivacyBadge.tsx`, `.activity-dot`) | Fixed bottom-right pill | Top-right note: local vs cloud wording stays distinct without colour |
| R-17 | Empty/placeholder text ("Your memories will appear here", "No matching entries") | Grey paragraphs | Marker-voice notes, same meaning |
| R-18 | Tests (`*.test.tsx`, `fakeIpc.ts`) | Assert old classes/text | Updated to the new structure; test ids kept |

## 6. Mood default marks

One fixed mark per mood, drawn from brush strokes (colour token + ink fleck), used identically in
the list, the calendar, the picker, the legend and the editor header. Exact paths in `design-detail.md`.

| Level | Name | Colour token | Default mark |
|-------|------|--------------|--------------|
| 1 | rough | coral | Two crossed strokes (an X) |
| 2 | low | lavender | A sagging bowl with a short line under it |
| 3 | okay | sky blue | Two level bars with a dot |
| 4 | good | green | A rising stroke with a shorter echo |
| 5 | great | ochre | Three upright strokes, the middle tallest |
| none | no mood | ink black | An open hand-drawn ring, no colour |

## 7. Acceptance criteria

16 ACs because the milestone covers the whole app (a normal milestone has 8–15).

```
AC-1  Tokens, light only
  Given the stylesheet
  When  it is scanned
  Then  every colour in component CSS comes from a token, there is no dark-mode media
        query, and the old sage/cream and --mood-1..5 values are gone
  Verify: auto

AC-2  Fonts are local
  Given the built app and a blocked network
  When  any screen renders
  Then  titles use Walter Turncoat (uppercase, tracked), reading text uses Spectral,
        both from bundled files, and no font request leaves the device
  Verify: auto

AC-3  Painted effects need no image assets
  Given the built bundle
  When  inspected
  Then  strokes, washes and rules come from inline SVG filters and CSS, with no new image files
  Verify: auto

AC-4  Every place in the replacement map is converted
  Given the list R-1..R-17
  When  the old class names and old token names are searched in src/
  Then  none remain, and each listed component renders the new structure
  Verify: auto

AC-5  Five default mood marks
  Given entries with mood levels 1 to 5
  When  the entry list, calendar, picker and legend render
  Then  each level shows its own default mark in its own colour token (§6), identical in every place
  Verify: auto

AC-6  No-mood default mark
  Given an entry whose mood_level is null
  When  it appears in the entry list, the calendar and the legend
  Then  it shows the open ink ring, and the picker has no mark selected
  Verify: auto

AC-7  Picking a mood
  Given an entry with an AI mood
  When  the user picks a mark in the picker
  Then  the mood is saved as manual, the list, calendar and header marks update at once, and the
        "AI guess" hint disappears
  Verify: auto

AC-8  Reflection drifts in
  Given a settled entry and a reflection arriving
  When  the panel receives it
  Then  it enters with the drift-in animation, never unanimated
  Verify: auto

AC-9  Reflection lingers, then dissolves
  Given a visible reflection
  When  the user keeps writing
  Then  it stays through the first keystrokes (linger threshold) and dissolves once writing continues
  Verify: auto

AC-10 Recall without a new AI call
  Given a dissolved reflection
  When  the user uses "bring it back"
  Then  the same text returns with the drift-in entrance and no model call is made
  Verify: auto

AC-11 Reduced motion
  Given prefers-reduced-motion: reduce
  When  a reflection enters or leaves, or a mark animates
  Then  only a short fade (or nothing) happens, with no drift, wiggle or scale
  Verify: auto

AC-12 Memories tucked
  Given related memories for the entry
  When  the journal view renders
  Then  they sit behind a "N memories" control; hover, focus or click reveals them, Esc or leaving
        hides them, and the reflection dissolving does not affect them
  Verify: auto

AC-13 Painted borders
  Given the journal view
  When  it renders
  Then  the three columns are separated by a painted black rule (left) and a painted blue rule (right)
  Verify: auto (structure) + manual (look)

AC-14 Every AI panel and privacy state survives
  Given each AiPanel state and both providers (local, cloud)
  When  the app renders them
  Then  each shows the same meaning and actions as today, and local vs cloud is distinguishable by
        words, not colour alone
  Verify: auto

AC-15 No regression
  Given the full existing suite plus the new tests
  When  pnpm check runs
  Then  everything passes
  Verify: auto

AC-16 Interactive pass over every screen
  Given the real app with the fixtures journal restored
  When  the user visits gate, onboarding, journal, calendar, search, settings, the cloud dialog
  Then  they all feel like one hand-painted system and each mood mark is recognisable
  Verify: manual
```

Provisional targets (tune on the mockup, not requirements): drift-in ~800 ms, dissolve ~1100 ms,
linger ~14 keystrokes.

## 8. Non-functional requirements

- Animations never delay typing; use opacity/transform only on the editor path.
- Filters sit on decorative pseudo-elements, never on the textarea or text.
- Light theme only; keyboard focus stays visible; text contrast stays readable on washes.
- No new runtime dependencies (fonts are static files).

## 9. Assumptions

- Marks are decorative; the mood's name stays available as `aria-label`/text.
- Painting your own mark is out of M1; the default mark is the entry's mark.
- Walter Turncoat has no lowercase issues because titles are uppercase; the `1` ambiguity is accepted
  unless the interactive pass flags it.

## Glossary

- **Reflection** — AI commentary on the current entry citing past entries.
- **Related memories** — excerpts of real past entries shown beside the reflection.
- **Drift-in / dissolve** — the enter/exit animations of the reflection.
- **Recall** — the control that brings a dissolved reflection back without a new AI call.
- **Default mark** — the fixed brush mark that stands for a mood (or, as a ring, for no mood).
- **Wash** — a loose, blotchy watercolour shape behind text, made with SVG filters.
- **Painted rule** — a wobbly marker line used as a border.
- **Save-settle** — the pause after typing when the app saves and requests the panel.
