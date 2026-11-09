# settings-search-polish — tests

Fixtures: existing Vitest setup in `src/test/` (mocked IPC, `openSettingsFromUnlockedApp` helper in `Settings.test.tsx`); screenshots via `shot.html` + `scripts/shot-metrics.sh`. New tests go in `Settings.test.tsx`, `Search.test.tsx`, `App.test.tsx`.

| ID | AC | Level | Case |
|----|----|-------|------|
| TC-1 | AC-1 | unit | Given Settings with chat_provider ollama When rendered Then the Ollama radio has checked=true and its label has class `is-checked`, the Cloud radio is unchecked without `is-checked` |
| TC-2 | AC-1 | unit | Given Settings with Ollama active When the Cloud radio is clicked (provider call succeeds, settings now claude_cli) Then `is-checked` moves to the Cloud choice |
| TC-3 | AC-2 | manual | Given the running Tauri app on Settings When the user clicks the other provider's radio or label Then the filled dot visibly moves to it |
| TC-4 | AC-3 | unit | Given Settings open from the unlocked app When the ✕ (name /close settings/) is clicked Then the settings pane is gone and the previous view returns; button has class `settings-close` |
| TC-5 | AC-3 | manual | Given the real app When Settings opens Then the ✕ is ≥32×32px (measured via shot script) and shows a hover state |
| TC-6 | AC-4 | unit | Given Settings open and no dialog When Escape is pressed Then Settings closes |
| TC-7 | AC-4 | unit | Given Settings open with the cloud confirm dialog showing When Escape is pressed Then Settings stays open (A-1) |
| TC-8 | AC-5 | unit | Given Settings When the Your data section renders Then it has an intro line and exactly three `.data-row`s, each with a title, a description and one button (`text-link`): Export Markdown, Back up, Restore |
| TC-9 | AC-6 | unit | Given the Your data section Then the Restore row follows a `.data-divider` and its description matches /only works into an empty journal/i; the two export rows come before the divider |
| TC-10 | AC-7 | unit | Given Search with no query run Then an intro line and 3 example buttons show; clicking one fills the input and calls ipc.search with that text |
| TC-11 | AC-8 | unit | Given Search with an empty input Then the Ask button is disabled; after typing text it is enabled; clicking it (and pressing Enter) calls ipc.search once per submit |
| TC-12 | AC-9 | unit | Given a search whose ipc.search promise is pending Then `searching…` is shown; given it resolves with zero results Then `No matching entries` and a hint are shown and `searching…` is gone |
| TC-13 | AC-10 | unit | Given results with created_at 2026-11-09 When rendered Then each result button shows a long-form date (contains `2026` and `Nov`), the snippet, and clicking calls onOpenEntry(entry_id); the answer card is before the results list in DOM order |
| TC-14 | AC-11 | unit | Given the unlocked app When the view is Journal Then side-panel is in the document and shell lacks `no-side`; when Calendar, Search or Settings is open Then shell has `no-side` |
| TC-15 | AC-11 | unit | Given the lock gate or onboarding screen Then shell has `no-side` |
| TC-16 | AC-11 | manual | Given the real app Then no blue rule or memories column on Search/Settings/Calendar; the journal at 900×600 looks unchanged (shot script before/after) |

## Existing tests that must change
- `Settings.test.tsx` TC-21 (paper-ui): radios keep class `painted-radio` on the input (kept for the test); `.data-actions` container with 3 `text-link` buttons stays (rows live inside it).
- `Calendar.test.tsx` lines ~130/134 check class `view-calendar`: kept as is (calendar keeps that class; `no-side` is added alongside).

## Manual checklist (AC-2, TC-3/5/16)
- [ ] `pnpm tauri dev`: Settings → click each provider → dot moves, no console errors
- [ ] ✕ and Esc both close
- [ ] Search/Settings/Calendar: no memories column; Journal: column present
- [ ] Gate and onboarding: no memories column

## Measurements (provisional, not pass/fail)
| What | How |
|------|-----|
| No window scroll at 900×600 on Settings and empty Search | `scripts/shot-metrics.sh settings 900 600` / `search 900 600` → `pageScroll` |
| ✕ size | `shot-metrics` rect of `.settings-close` |
