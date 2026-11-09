# settings-search-polish — spec

## 0. Review guide

Fix and polish the Settings and Search pages: a radio whose selected state is unmistakable, a proper close control, a clear "Your data" section, a more helpful Search page, and the memories side panel shown only on the Journal page. UI only — no backend or search-behaviour change.

Review order: §4 scope → §6 ACs → decisions below.

| ID | Decision | Status |
|----|----------|--------|
| D-1 | Close control | Decided: larger ✕ top-right, plus Esc (2026-11-09) |
| D-2 | "Your data" layout | Decided: three described rows (2026-11-09) |
| D-3 | Search scope | Decided: polish only; no new backend (2026-11-09) |

Open risks: the radio bug may only reproduce in the real WKWebView (Tauri), not headless Chrome — verification must run the real app ([[verify-means-run-the-app]]). Mood marks on results are out because the search result has no mood field.

Prerequisites the user owns: a hands-on pass in the real app at the end.

## 1. Problem

User feedback on the current build:
- The checked state of the provider radio "does not work".
- Settings: the close button is weak; "Your data" is unclear.
- Search is bare and needs improving.
- The memories side panel appears on Settings and Search, where it has no meaning.

## 2. Goals and measures

- G-1 The selected radio is distinguishable at a glance — AC-1, AC-2.
- G-2 Settings is leavable and scannable — AC-3…AC-6.
- G-3 Search guides the user and shows state — AC-7…AC-10.
- G-4 Side panel only on Journal — AC-11.

## 3. Data/reality (observed in headless Chrome render, 2026-11-09) [verified]

- Selected radio renders as a muddy blue smudge inside the ring (`.painted-radio:checked::after` with `filter: url(#paint-s)`); whether it renders in WKWebView is **[assumption]: unverified**.
- Close ✕ is ~14px, far right, no hover state; top-bar "Settings" link toggles, nav hidden while in Settings.
- "Your data": three small uppercase links on one line, no explanation of what each does.
- Search: only an input line; empty page below, no loading/empty cue. Side panel shows "Your memories will appear here." on both pages.
- `SearchResult` = {entry_id, snippet, created_at, distance} — no mood.

## 4. Scope

In:
- Radio selected state (provider radios, any other painted radio).
- Settings: ✕ close, section structure, "Your data" rows.
- Search: empty state with examples, Ask button, loading and no-match states, tidier results/answer.
- Side panel hidden unless view is Journal (and not in Settings).

Out: new settings, backend changes, filters, mood marks on results, highlight, dark mode, new fonts/textures (see [[little-little-paper-ui]]).

## 5. Users and key flows

Single local user. Flows: open Settings → choose provider → close; export/back up/restore; ask the journal a question → read answer → open a result.

## 6. Acceptance criteria

AC-1  Selected radio is visible
  Given Settings with provider "On-device" active
  When  the pane renders
  Then  exactly one provider radio has a filled selected indicator that differs from the unselected one (checked state exposed via `checked` and a distinct painted class/style)
  Verify: auto

AC-2  Selected radio in the real app
  Given the running Tauri app on Settings
  When  the user clicks the other provider radio (or its label)
  Then  the filled indicator visibly moves to it
  Verify: manual

AC-3  Close button
  Given Settings is open
  When  the user clicks ✕
  Then  Settings closes and the previous view returns; the button is at least 32×32px with a hover state and label "close settings"
  Verify: auto

AC-4  Esc closes Settings
  Given Settings is open and no dialog is open
  When  the user presses Escape
  Then  Settings closes
  Verify: auto

AC-5  Your data rows
  Given Settings
  When  the "Your data" section renders
  Then  it shows an intro line and three rows (Export Markdown, Back up, Restore), each with a title, a one-line description and one button
  Verify: auto

AC-6  Restore is distinct and explains its limit
  Given the "Your data" section
  When  rendered
  Then  Restore is separated from the two export rows and its description says it only works into an empty journal
  Verify: auto

AC-7  Search empty state
  Given Search with no query run
  When  the page renders
  Then  a one-line explanation and 2–3 example questions are shown; clicking an example fills the input and runs the search
  Verify: auto

AC-8  Submit button
  Given a non-empty query
  When  the user clicks the Ask button (the submit button; the nav already has "Search") or presses Enter
  Then  the search runs; the button is disabled while the query is empty
  Verify: auto

AC-9  Loading and no-match states
  Given a search in flight / returning zero results
  When  rendering
  Then  a "searching…" indicator shows in flight, and a "No matching entries" message with a hint shows for zero results
  Verify: auto

AC-10  Result presentation
  Given results with created_at dates
  When  rendered
  Then  each result shows a readable date (weekday, day, month, year), the snippet, and is a button that opens the entry; the AI answer card appears above results
  Verify: auto

AC-11  Side panel only on Journal
  Given the app unlocked
  When  the view is Journal / Calendar / Search / Settings
  Then  the side panel and blue rule are present only in Journal; Search, Settings and Calendar use full width
  Verify: auto (DOM) + manual (visual)

## 7. Non-functional

- Keep the painted look; no new fonts, textures, dark mode.
- Pages must not scroll the window at 900×600 minimum size for empty states (provisional target — measure first).
- Existing tests keep passing (`pnpm check`).

## 8. Assumptions

- A-1 Esc handling must not fire while the cloud confirm dialog is open.
- A-2 The radio fix is CSS/markup only.
- A-3 Search examples are static text, not generated from the journal.

## Appendix: Glossary

- **Painted radio** — custom radio drawn with CSS pseudo-elements and the SVG `#ink`/`#paint-s` filters in `index.html`.
- **Side panel** — the right-hand "memories" column (`AiPanel`) with the blue rule.
