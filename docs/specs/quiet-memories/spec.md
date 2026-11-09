# quiet-memories — spec

> Retroactive: the change was built from user feedback on 2026-11-09 before this spec existed. The ACs below describe what was decided; later stages verify the code against them.

## 0. Review guide

Nothing is generated while you write a new page; after a long pause it may ask. Opening an old page never starts the model. The memories side shows related pages in two groups, Earlier and Later.

Review order: §4 scope → §6 ACs → decisions.

| ID | Decision | Status |
|----|----------|--------|
| D-1 | New page asks for memories | Decided: only after a long pause (30 s quiet + enough text), typing cancels (2026-11-09) |
| D-2 | Old page | Decided: show what exists, never auto-start; "Look back" on demand (2026-11-09) |
| D-3 | Memories layout | Decided: "N memories" opens Earlier and Later groups (2026-11-09) |
| D-4 | Page left before the pause | Decided: accept the gap for now (2026-11-09) |

Open risks: 30 s and 200 characters are guesses. Real-window check is the user's.

## 1. Problem

A 1-second pause while writing saved the page and at once asked for memories and a reflection (an embedding lookup plus a chat-model call, to Claude when Cloud is on) from a half-written thought. Opening an old page did the same. Related pages were one flat list with no sense of time.

## 2. Goals and measures

- G-1 Nothing is generated mid-thought — AC-1…AC-4.
- G-2 No surprise model calls or cloud sends when browsing — AC-5…AC-7.
- G-3 The memories side shows what came before and after — AC-8…AC-11.

## 3. Data/reality [verified in code, 2026-11-09]

- Before: `Editor` autosave (1 s) → `onSaved` → `get_ai_panel` → `build_ai_panel` embeds, retrieves 3 nearest, calls the chat provider unless a reflection is stored.
- `related_entries` already returns each entry's `created_at`; no schema change is needed.
- Chinese text has no spaces, so "enough text" counts characters, not words.

## 4. Scope

In: idle-gated asking for new pages; `generate` flag on `get_ai_panel`; `not_requested` state and "Look back"; Earlier/Later grouping in backend and panel.

Out: changing the reflection's own sources (still the 3 nearest), Settings for the timings, asking on leaving a page, mood or search behaviour, new dependencies.

## 5. Users and key flows

One local user. Write a new page → pause → memories arrive. Open an older page → see stored reflection or "Look back". Open "N memories" → Earlier and Later.

## 6. Acceptance criteria

AC-1  Saving does not ask
  Given a new page with enough text
  When  the autosave completes
  Then  no memory or reflection request is made at that moment
  Verify: auto

AC-2  A long pause asks once
  Given a saved new page with enough text
  When  30 seconds pass with no typing
  Then  memories and a reflection are requested once, for that page, with generation allowed
  Verify: auto

AC-3  Typing restarts the wait
  Given a pending request after a save
  When  the user types again
  Then  the pending request is cancelled and only the next save starts a new wait
  Verify: auto

AC-4  Short pages never ask
  Given a new page below the minimum length
  When  any amount of time passes
  Then  no request is made
  Verify: auto

AC-5  Opening an old page never starts the model
  Given a page with no stored reflection
  When  the user opens it
  Then  the chat model is not called and the panel state is "not requested"
  Verify: auto

AC-6  A stored reflection is shown without generating
  Given a page whose reflection was made earlier
  When  the user opens it
  Then  that reflection is shown and no new model call is made
  Verify: auto

AC-7  Look back asks on demand
  Given the "not requested" panel
  When  the user clicks "Look back"
  Then  memories and a reflection are requested with generation allowed
  Verify: auto

AC-8  Earlier and Later groups
  Given related pages written both before and after the open page
  When  the user opens "N memories"
  Then  an "Earlier" group (before) and a "Later" group (after) are shown, Earlier first
  Verify: auto

AC-9  An empty side is hidden
  Given related pages on only one side
  When  "N memories" is opened
  Then  only that side's group is shown
  Verify: auto

AC-10  Each side is capped and ordered
  Given many related pages
  When  the panel is built
  Then  each side has at most 3, nearest in time first
  Verify: auto

AC-11  The reflection's sources are unchanged
  Given an entry with related pages
  When  a reflection is generated
  Then  it is written from the 3 nearest pages and its "based on" line lists them
  Verify: auto

AC-12  Arriving on a page shows its panel
  Given a journal with entries
  When  the user unlocks it (or restores a backup) and the latest page opens
  Then  that page's stored memories and reflection are looked up without generating, so the right side is not empty
  Verify: auto

Provisional targets — measure first: 30 s idle, 200 non-space characters, pool of 12 nearest, 3 per side.

## 7. Non-functional

- No model call and no cloud send happen without one of: the long pause, "Look back", or Regenerate.
- Existing journal data is untouched (no migration).

## 8. Assumptions

- A-1 The 1 s autosave stays as is; only the panel request is delayed.
- A-2 A page's date for Earlier/Later is its `created_at`.

## Appendix: Glossary

- **Reflection** — the short AI note written from the page and its related pages.
- **Memories** — related past or later pages found by meaning (local embeddings).
- **Look back** — the button that asks for memories and a reflection on demand.
- **Not requested** — the panel state for a page with no stored reflection when generation was not asked for.
