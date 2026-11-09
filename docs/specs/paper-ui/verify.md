# paper-ui — verify

Verified 2026-11-09. **Verdict: pass.** The one open item from the last session (the interactive pass, T-13) was confirmed by the user.

## Run (this session)

`pnpm check`: exit 0. 13 frontend test files, **191 tests passed**; `tsc` and `vite build` clean; Rust **72 passed, 0 failed, 5 ignored** (live-Ollama tests); `clippy -D warnings` clean.

## Results

| AC | Test(s) | Result | Evidence |
|----|---------|--------|----------|
| AC-1 tokens, light only | TC-1 | pass | paintedUi.test.ts (no colour literal outside :root, no dark query, old tokens gone) |
| AC-2 fonts are local | TC-2 | pass | paintedUi.test.ts (4 @font-face files exist, no http, licences shipped) |
| AC-3 painted effects need no image assets | TC-3, TC-4, TC-23 | pass | paintedUi.test.ts; spike TC-23 confirmed by the user in the real webview |
| AC-4 every mapped place converted | TC-5, TC-21 | pass | paintedUi.test.ts (every source file scanned) + per-screen structure tests (calendar, search, settings, gate, onboarding) |
| AC-5 five default marks | TC-6, TC-7 | pass | MoodMark.test.tsx, Calendar.test.tsx (identical in list, picker, calendar, legend) |
| AC-6 no-mood mark | TC-8 | pass | MoodMark.test.tsx, Calendar.test.tsx |
| AC-7 picking a mood | TC-9 | pass | App.test.tsx |
| AC-8 reflection drifts in | TC-10, TC-11 | pass | AiPanel.test.tsx |
| AC-9 lingers, then dissolves | TC-12 (+ timeout fallback) | pass | AiPanel.test.tsx |
| AC-10 recall without a model call | TC-13 | pass | AiPanel.test.tsx |
| AC-11 reduced motion | TC-14 + static CSS test | pass | AiPanel.test.tsx, paintedUi.test.ts |
| AC-12 memories tucked | TC-15 | pass | AiPanel.test.tsx |
| AC-13 painted borders | TC-16 (structure), TC-17 (look) | pass / **manual-ok** | App.test.tsx; the user confirmed the look |
| AC-14 every AI panel and privacy state survives | TC-18, TC-19 | pass | AiPanel.test.tsx, App.test.tsx, Settings.test.tsx |
| AC-15 no regression | TC-20 | pass | `pnpm check` exit 0 (above) |
| AC-16 interactive pass over every screen | TC-22 | **manual-ok** | the user confirmed (2026-11-09): all screens feel like one hand-painted system and the marks are recognisable |

## Measurements (provisional, from `tests.md`)

| What | Result |
|------|--------|
| Drift-in / dissolve duration (800 / 1100 ms) | unchanged in code (`--drift-in`, `--dissolve`); no tuning requested after real use |
| Linger threshold (14 keys) | unchanged (`LINGER_KEYS`); no tuning requested |
| Scroll smoothness with 57 and 200 entries | 60-row spike confirmed smooth in the real webview (T-01); 57-entry fixtures used daily without complaint; 200-entry list not measured |
| Typing latency with a reflection visible | not measured numerically (needs the real window); the real-race fixes in `useAutosave` and `Editor` were found while testing this; no lag reported |

## Drift check

Names, test ids and tokens match the code (the TC-5 scan covers every source file). Documented later changes in `spec.md`: custom painted marks (spec `paint-marks`) and the window/calendar layout (spec `window-polish`) now supersede parts of this spec's scope, so a note was added at its top; the "paint your own mark" backlog item is marked done. The font licences note was corrected earlier (Walter Turncoat is Apache 2.0, Spectral OFL).

## Scope

Nothing from `backlog.md` leaked in during this spec's build. Still open in its backlog (not scope creep): deeper reference palette, animated pending mood, large gouache empty-state art, mood clearing, list virtualisation, sound/haptics, mood-coloured memory bars.

## Findings

None open. Resolved during the build: the intermittent test failures (two real races in autosave/editor), the list and editor scrolling together, the test helper leaking mocks between tests.
