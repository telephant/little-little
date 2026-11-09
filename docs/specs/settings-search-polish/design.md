# settings-search-polish — design

Reading order: this file → `diagrams/index.html` (rendered from `diagrams/diagrams.md`). `design-detail.md` is reference only.

All changes are frontend (React + CSS). No IPC, Rust, schema or dependency change, so no ADR is needed (nothing hard to reverse).

## Components

| ID | Job | Notes |
|----|-----|-------|
| C-1 | `PaintedRadio` (new, `src/components/PaintedRadio.tsx`) | A labelled radio: real `<input type=radio>` (visually hidden, keeps keyboard/a11y) + a `<span class="radio-mark">` whose filled dot is rendered from React state (`is-checked` class), not from `:checked::after`. Used by Settings provider choice. |
| C-2 | Settings shell (`screens/Settings.tsx`) | Header with 32px ✕ button; Esc handler; sections unchanged except C-3. |
| C-3 | `DataRow` (inline in Settings) | One row: title, one-line description, action button. Three rows; Restore sits after a divider with a "Restore" caution note. |
| C-4 | Search page (`screens/Search.tsx`) | Input + Ask button, empty state with example questions, `searching…` and no-match states, result list with long dates, answer card above results. |
| C-5 | App shell side-panel rule (`App.tsx` + `App.css`) | One flag `showSide = work view is journal`; shell gets `no-side` class otherwise (replaces `view-calendar`). |

## Key flows

- Choose provider → C-1 reflects `settings.chat_provider` immediately; cloud first-time confirm unchanged. (diagram: Settings flow)
- Leave Settings → ✕ or Esc → `onClose`. Esc is ignored while the cloud confirm dialog is open (A-1).
- Search → empty state / example click → run → loading → results + answer. (diagram: Search states)
- View change → C-5 toggles `no-side`.

## Contracts

| Where | Contract |
|-------|----------|
| `PaintedRadio` props | `{ name, checked, onChange, children, disabled? }` |
| `Settings` props | unchanged |
| `Search` props | unchanged (`onOpenEntry`) |
| Shell class | `shell no-side` when view ≠ journal or settings open; `platform-mac` unchanged |

## Tricky parts

- **Radio bug cause is unverified in WKWebView.** Chrome shows a smeared dot (SVG displacement filter on a ~10px pseudo-element). The design removes the dependency on `:checked::after` + filter for the dot: a plain cobalt dot (slightly irregular `border-radius` for the painted feel), ring keeps `filter:url(#ink)`. Final proof is the manual real-app check (AC-2).
- **Layout when the side column is gone:** the grid becomes one column (as the calendar already does); Settings/Search keep their `max-width` so lines stay readable. The blue rule disappears with the panel.
- **Gate/onboarding** also lose the side column (decided 2026-11-09): it is shown only in the unlocked Journal view.
- **Esc scope:** a `keydown` listener on `window` registered in Settings only while mounted and while the confirm dialog is not open.

## Failure modes

- Esc closes Settings while a native file dialog is open → the native dialog takes the key; no issue.
- Export/restore errors still surface via the existing `error` line, now placed under the relevant row group.

## Technology

React + CSS only; Vitest + Testing Library for tests; headless Chrome shots via `shot.html` plus a real `pnpm tauri dev` check.

## AC coverage

| AC | Covered by |
|----|-----------|
| AC-1 | C-1 |
| AC-2 | C-1 (manual, real app) |
| AC-3 | C-2 |
| AC-4 | C-2 |
| AC-5 | C-3 |
| AC-6 | C-3 |
| AC-7 | C-4 |
| AC-8 | C-4 |
| AC-9 | C-4 |
| AC-10 | C-4 |
| AC-11 | C-5 |

## Questions to answer before approving this design

- [x] Replace the dot's SVG filter with a plain irregular-circle dot (loses a little paint texture, gains reliability)?
- [x] Side column on lock/onboarding screens: hide it too (decided: only Journal shows it)
- [x] Skip ER/state diagrams (no data or lifecycle change)?
