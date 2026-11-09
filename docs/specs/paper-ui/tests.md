# paper-ui — tests

## Test data

- Entries: the `journal-fixtures` 57-entry dataset (`src-tauri/tests/fixtures/journal-dataset.json`) for the manual pass; unit/integration tests use `src/test/fakeIpc.ts` with hand-made entries covering mood levels 1–5, `null`, and a free-text-only label.
- Bad cases: entry with `mood_level: null` and `mood_label: "proud"`; panel arriving while typing; `animationend` never firing (fake timers); reduced-motion via a `matchMedia` mock.
- External systems are faked in `fakeIpc.ts`; no network in any test. Static scan tests live in `src/lib/paintedUi.test.ts`.
- jsdom has no animations: tests assert classes and dispatch `new AnimationEvent("animationend")` by hand.

## Cases

| ID | AC | Level | Case (Given / When / Then) | File |
|----|----|-------|------|------|
| TC-1 Tokens only, light only | AC-1 | unit | Given the stylesheets under src/, when a test scans them, then no colour literal exists outside :root, no prefers-color-scheme: dark query, and --bg, --bg-panel, --accent, --border, --mood-1..5 are absent. | src/lib/paintedUi.test.ts |
| TC-2 Fonts are bundled files | AC-2 | unit | Given App.css and the build config, when a test reads every @font-face src and the font files, then each src is a relative file under src/assets/fonts that exists (Walter Turncoat 400; Spectral 400, 500, italic 400), no http(s) URL appears in any CSS or index.html, and a licence file for each font ships beside them. | src/lib/paintedUi.test.ts |
| TC-3 No new image assets | AC-3 | unit | Given the repo before and after the change, when a test lists src/ and public/ for png/jpg/gif/webp/svg files, then none were added beyond the existing ones; all filters are inline <filter> elements in index.html. | src/lib/paintedUi.test.ts |
| TC-4 Filters not on text | AC-3 | unit | Given the stylesheets, when a test scans rules using filter:url(, then none targets textarea, input, p, or an element holding text; only pseudo-elements and mark SVGs. | src/lib/paintedUi.test.ts |
| TC-5 No legacy classes or tokens | AC-4 | unit | Given src/ source files (not tests of the old structure), when a test greps for the old class names and old token names listed in tests fixture OLD_NAMES, then none remain. | src/lib/paintedUi.test.ts |
| TC-6 Five marks, own colour | AC-5 | unit | Given MoodMark with level 1..5, when each renders, then it shows a distinct SVG with data-mood=N and its own token colour var(--mN), and the same markup is produced for every size. | src/components/MoodMark.test.tsx |
| TC-7 Marks identical across places | AC-5 | integration | Given entries with mood levels 1 to 5, when EntryList, Calendar, MoodPicker and legend render, then each level's mark has the same data-mood and the same path markup in all four places. | src/components/MoodMark.test.tsx |
| TC-8 No-mood ring | AC-6 | unit | Given MoodMark level=null, and an entry with mood_level null (including one with only a free-text mood_label), when it renders in list, calendar and legend, and the picker opens, then the open ink ring (data-mood=none) shows with the label text if any, and no picker mark is selected. | src/components/MoodMark.test.tsx |
| TC-9 Pick saves manual | AC-7 | integration | Given an entry with an AI mood, when the user clicks another mark in the picker, then set_mood is called with source manual, list, calendar and header marks update, and the 'AI guess' hint disappears. | src/App.test.tsx |
| TC-10 Drift-in on arrival | AC-8 | integration | Given a settled entry (editor idle) and a ready panel arriving, when AiPanel receives it, then the reflection has the arriving class (drift-in animation), never rendered without it; after animationend it becomes present. | src/AiPanel.test.tsx |
| TC-11 Hot editor goes straight to tucked | AC-8 | integration | Given the user is typing when the panel becomes ready, when the panel arrives, then no arriving animation; state is tucked and 'bring it back' is shown. | src/AiPanel.test.tsx |
| TC-12 Linger then dissolve | AC-9 | integration | Given a visible reflection, when the user types fewer than 14 keys, then more, then it stays below the threshold and gets the dissolving class at the threshold; it unmounts to tucked on animationend, or after duration+150 ms via fake timers if animationend never fires. | src/AiPanel.test.tsx |
| TC-13 Recall without model call | AC-10 | integration | Given a dissolved (tucked) reflection, when the user clicks 'bring it back', then the same text returns with the arriving class and the regenerate IPC mock was not called. | src/AiPanel.test.tsx |
| TC-14 Reduced motion | AC-11 | integration | Given matchMedia prefers-reduced-motion: reduce, when a reflection enters and leaves and a mark hovers, then only the fade variant class is applied; no drift, wiggle or scale class. | src/AiPanel.test.tsx |
| TC-15 Memories tucked and revealed | AC-12 | integration | Given related memories for the entry, when the journal view renders, then the control is hovered, focused or clicked, then Esc or leave, then a 'N memories' control is shown, notes are hidden; they appear on hover/focus/click and hide on Esc/leave; the reflection dissolving leaves memoriesOpen unchanged. | src/AiPanel.test.tsx |
| TC-16 Painted column rules | AC-13 | integration | Given the journal view, when it renders, then three columns exist, separated by one element with the black-rule class (left) and one with the blue-rule class (right). | src/App.test.tsx |
| TC-17 Rules look painted | AC-13 | manual | Given the journal in the real app, when the user looks at the column borders, then they read as painted black (left) and blue (right) wobbly rules, not CSS lines. | manual |
| TC-18 Every AiPanel state | AC-14 | integration | Given each of models_not_chosen, thinking, nothing_to_relate, provider_unavailable, ready, when the panel renders, then each keeps the same meaning text and actions as before (Choose models, Regenerate, Dismiss, reason text). | src/AiPanel.test.tsx |
| TC-19 Local vs cloud by words | AC-14 | integration | Given provider local, then cloud, when PrivacyBadge renders, then the wording differs ('on this device' vs the cloud wording) independent of colour, and the CloudConfirmDialog keeps its copy and two actions. | src/App.test.tsx |
| TC-20 Full suite | AC-15 | integration | Given the repo, when pnpm check runs, then typecheck, vitest and cargo checks all pass. | pnpm check |
| TC-21 Every mapped screen renders new structure | AC-4 | integration | Given Gate (first-run, locked, error), Onboarding, Calendar, Search (answer, sources, hidden note, empty), Settings, CloudConfirmDialog, StatusChips, when each renders with its existing data-testids, then the testids resolve and the painted structure classes are present. | src/Onboarding.test.tsx, src/Calendar.test.tsx, src/Search.test.tsx, src/Settings.test.tsx, src/App.test.tsx |
| TC-22 Interactive pass | AC-16 | manual | Given the real app with the fixtures journal restored, when the user visits gate, onboarding, journal, calendar, search, settings and the cloud dialog, then they all feel like one hand-painted system and each mood mark is recognisable; the numeral 1 in dates is readable. | manual |
| TC-23 Webview parity (spike) | AC-3 | manual | Given pnpm tauri dev on macOS (WKWebView), when the spike page renders marks, wash and rules, then they render acceptably and scrolling a 60-entry list stays smooth; otherwise the flat-colour fallback class is adopted. | manual |

## Manual checklist (AC-13, AC-16)

- [ ] Black rule left, blue rule right, both look painted (TC-17)
- [ ] Gate, onboarding, journal, calendar, search, settings, cloud dialog feel like one system (TC-22)
- [ ] Each of the five marks and the ring recognisable at list, calendar and header sizes
- [ ] Dates with the numeral 1 readable
- [ ] Reflection drifts in, lingers, dissolves, recall works; reduced-motion setting calms it
- [ ] Body text readable on the wash

## Measurements (not pass/fail yet)

| What | How |
|------|-----|
| Drift-in / dissolve duration (~800 / ~1100 ms) | stopwatch on the real app; tune in CSS variables |
| Linger threshold (~14 keys) | try while writing a real entry; tune constant |
| Scroll smoothness with 57 and 200 entries | DevTools performance trace in the Tauri webview (TC-23) |
| Typing latency with a reflection visible | compare keydown-to-paint with and without panel |
