# quiet-memories — design

Reading order: this file → `diagrams/index.html` (from `diagrams/diagrams.md`). `design-detail.md` is reference only.

Retroactive: this describes the code as built on 2026-11-09. No schema change, no new dependency, no hard-to-reverse choice, so no ADR.

## Components

| ID | Job | Notes |
|----|-----|-------|
| C-1 | `useReflectIdle` (`src/hooks/useReflectIdle.ts`) | `schedule(entryId, body)` starts one timer if the body has enough characters; `cancel()` clears it; unmount cancels. Live values in `reflectTiming` (30 000 ms, 200 chars). |
| C-2 | App wiring (`src/App.tsx`) | `loadPanel(id, generate)`; save → `schedule`; keystroke → `cancel`; open/new entry → `cancel`; open entry → `loadPanel(id, false)`; "Look back" → `loadPanel(id, true)`. |
| C-3 | `build_ai_panel_opts(.., generate)` (`src-tauri/src/prompt/mod.rs`) + `get_ai_panel(entry_id, generate)` | With `generate = false` the chat model is never called: stored reflection → `Ready`, else `NotRequested`. `build_ai_panel` = `generate: true`. |
| C-4 | `split_neighbours` (same file) | From the 12 nearest by meaning: Earlier = created before the open entry, newest first; Later = after it, oldest first; each capped at 3. |
| C-5 | `AiPanel` (`src/components/AiPanel.tsx`) | `not_requested` view with "Look back"; "N memories" control opens groups "Earlier" and "Later"; an empty group is omitted. |

## Key flows

- New page: type → autosave (1 s, unchanged) → `schedule` → 30 s quiet → `loadPanel(id, true)`. (sequence diagram)
- Typing again → `cancel`; next save → `schedule` again.
- Open old page → `loadPanel(id, false)` → `Ready` (stored) or `NotRequested` → "Look back" → `loadPanel(id, true)`. (state diagram)
- Open "N memories" → two groups.

## Contracts

| Where | Contract |
|-------|----------|
| `get_ai_panel` | `{ entryId, generate: boolean }` → `PanelState` |
| `PanelState` | adds `not_requested`; `ready` gains `earlier: RelatedEntry[]`, `later: RelatedEntry[]` (`related` unchanged) |
| `Editor.onSaved` | now passes the saved body: `(body: string) => void` |
| Timing | `REFLECT_IDLE_MS = 30000`, `REFLECT_MIN_CHARS = 200` (provisional) |

## Tricky parts

- **Cancel on keystroke, schedule on save.** Save fires 1 s after the last key, so the wait is 30 s after the save; any key cancels it, so a half-finished thought never asks.
- **Characters, not words**, so Chinese (no spaces) counts.
- **Stale timers:** one timer per hook; opening or creating an entry cancels it, so a timer can never ask for the wrong page.
- **Reflection context unchanged:** `related` (3 nearest) still feeds the prompt and the "based on" line; `earlier`/`later` are display only and come from a second, wider retrieval of the same query vector.
- **No-cloud entries** stay filtered by the same `cloud` flag for the wider pool.
- **Embedding still pending** when the timer fires → existing `thinking` retry loop.

## Failure modes

- Provider down on a long pause → `provider_unavailable` as today; typing is unaffected.
- Page left before the pause → no automatic reflection; "Look back" on reopen (accepted, backlog).
- Entry text edited between save and timer → the timer asks for the latest saved text; a newer save reschedules.

## Technology

React hook + Rust (rusqlite/sqlite-vec retrieval already in place). Nothing new.

## AC coverage

| AC | Covered by |
|----|-----------|
| AC-1 | C-2 (save only schedules) |
| AC-2 | C-1, C-2 |
| AC-3 | C-1, C-2 |
| AC-4 | C-1 |
| AC-5 | C-3, C-2 |
| AC-6 | C-3 |
| AC-7 | C-2, C-5 |
| AC-8 | C-4, C-5 |
| AC-9 | C-5 |
| AC-10 | C-4 |
| AC-11 | C-3 |

## Questions to answer before approving this design

- [x] Is the 1 s autosave left alone and only the panel request delayed? (yes, A-1)
- [x] Is the wider retrieval (12) cheap enough to run on every panel build? (local vector search only; no model)
- [x] Should "Look back" and Regenerate be the only manual triggers? (yes for now)
