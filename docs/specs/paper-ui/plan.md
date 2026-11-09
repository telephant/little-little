# paper-ui — plan

## Plan validation

Checks run (grep over the docs, 2026-11-06):

| # | Check | Result |
|---|-------|--------|
| 1 | AC -> test (16/16 ACs have >= 1 TC; no orphan TC) | pass |
| 2 | AC -> design (design.md AC coverage table) | pass |
| 3 | AC -> task (every AC named in >= 1 task) | pass |
| 4 | Names/testids/classes consistent (testids kept; classes introduced by T-04, T-06) | pass |
| 5 | No Proposed ADR (design needs none) | pass |
| 6 | Claims tagged; invented numbers (800 ms, 1100 ms, 14 keys) stay provisional, listed under Measurements | pass |
| 7 | Backlog leakage (custom marks, dark mode, virtualisation) | none |
| 8 | Every task file carries full Given/When/Then of its TCs | pass |

Findings fixed: TC-1 (no legacy tokens) moved from T-02 to T-12 because T-02 keeps aliases.

Open items resolved on recommendation (user said to finish the redesign): the design gate was still
pending; proceeding on mockup v18 + spec. Webview parity is decided by T-01 (spike). The 16-AC size
is kept as one milestone. No design review existed, so nothing to retire.


## Order (walking skeleton)

Spike first: **T-01** de-risks the biggest unverified claim (SVG filters in the real WKWebView, filter cost). If it fails, every later task uses the `.no-filter` flat-colour fallback.

| Phase | Tasks | Milestone / ACs | Effort |
|---|---|---|---|
| 0 Spike | T-01 | webview parity decided | S |
| 1 Foundation | T-02, T-03 | tokens, fonts, filters, MoodMark: AC-1,2,3 (+5,6 unit) | M |
| 2 Journal skeleton | T-04, T-05, T-06, T-07 | journal view end-to-end: AC-5,6,7,8,9,10,11,12,13,14 | L |
| 3 Other screens | T-08, T-09, T-10, T-11 | calendar, search, settings, dialog, gate, onboarding: AC-4 | L |
| 4 Close | T-12, T-13 | AC-1,4,15 then AC-16 (user) | S + user |

## Spike result (T-01, 2026-11-06)

In the real Tauri webview (WKWebView, dev window) the brush marks, black/blue wobbly rules and watercolour wash rendered like the mockup and a 60-row list of filtered marks scrolled smoothly (user-confirmed by eye; I could not screenshot from the terminal). Decision: **keep the SVG filters**; `.no-filter` fallback stays only as the failure-mode class. The filter defs are already in `index.html` (kept for T-02).

## Notes from implementation

- T-07: memory notes use a neutral sky bar, not a mood colour, because `RelatedEntry` carries no mood level (the spec's mood-coloured bar would need a backend field; out of scope, candidate for backlog).

- T-10: intermittent test failures (~1 run in 5-25: the panel never loaded) were two real races, not load: `useAutosave` skipped an edit landing before its first effect run, and `Editor` reset its text on mount. Fixed both (baseline comparison in `src/hooks/useAutosave.ts`; id-change-only reset in `src/components/Editor.tsx`) and added a regression test in `App.test.tsx`. After the fix: 40/40 clean runs of AiPanel+App tests, full `pnpm check` green. Test waits were also widened (3s -> 6s, testTimeout 12s) as a safety margin.

- Post-T-12 fix (user report): in the journal view the list and the editor scrolled together because both sat in one scrolling pane. The journal pane is now fixed (`main-pane-fixed`), the entry list and the writing area scroll on their own; other views (calendar, search, settings) still scroll normally. Tests: App.test.tsx, paintedUi.test.ts.

## Tasks

| Task | Title | Implements | Depends on |
|---|---|---|---|
| ✅ 2026-11-06 [T-01](tasks/T-01.md) | Spike: painted effects in the real Tauri webview | AC-3 | - |
| ✅ 2026-11-06 [T-02](tasks/T-02.md) | Tokens, fonts and filter definitions | AC-1, AC-2, AC-3 | T-01 |
| ✅ 2026-11-06 [T-03](tasks/T-03.md) | MoodMark component | AC-5, AC-6 | T-02 |
| ✅ 2026-11-06 [T-04](tasks/T-04.md) | Shell, nav, status chips, privacy badge | AC-13, AC-14 | T-02 |
| ✅ 2026-11-06 [T-05](tasks/T-05.md) | Entry list, editor, mood picker, tags | AC-5, AC-6, AC-7 | T-03, T-04 |
| ✅ 2026-11-06 [T-06](tasks/T-06.md) | Reflection lifecycle and motion | AC-8, AC-9, AC-10, AC-11 | T-04 |
| ✅ 2026-11-06 [T-07](tasks/T-07.md) | AiPanel restyle and memories control | AC-12, AC-14 | T-06 |
| ✅ 2026-11-06 [T-08](tasks/T-08.md) | Calendar restyle | AC-5, AC-6, AC-4 | T-03 |
| ✅ 2026-11-06 [T-09](tasks/T-09.md) | Search restyle | AC-4 | T-02 |
| ✅ 2026-11-06 [T-10](tasks/T-10.md) | Settings and cloud dialog restyle | AC-4, AC-14 | T-02 |
| ✅ 2026-11-06 [T-11](tasks/T-11.md) | Gate and onboarding restyle | AC-4 | T-03 |
| ✅ 2026-11-06 [T-12](tasks/T-12.md) | Legacy sweep and full check | AC-1, AC-4, AC-15 | T-05, T-06, T-07, T-08, T-09, T-10, T-11 |
| ✅ 2026-11-09 [T-13](tasks/T-13.md) | Interactive pass (manual) | AC-16, AC-13 | T-12 |

## Definition of Done (every task)

- Tests from the task written first and green; `pnpm check` green.
- Docs updated (spec/design if reality differs); `status.yaml` AC status updated.
- No secrets, no new runtime dependency, no network font.
- Verified in the running app for any task that changes visible UI (see memory: verify means run the app).

## Out of this milestone

Everything in `backlog.md` (custom marks, dark mode, extra palette, virtualisation, sounds).
