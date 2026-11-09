# quiet-memories — tests

Retroactive: these tests were written with the code on 2026-11-09 (frontend Vitest with the fake IPC in `src/test/fakeIpc.ts`; Rust tests in `src-tauri/src/prompt/mod.rs` with fake providers). The plan only maps them to the ACs.

| ID | AC | Level | Case | Where |
|----|----|-------|------|-------|
| TC-1 | AC-1 | unit/integration | Given a new page with enough text When the autosave completes Then no get_ai_panel call has been made yet | QuietReflection.test.tsx QR-5 |
| TC-2 | AC-2 | unit + integration | Given a saved new page with enough text When the idle window elapses with no typing Then get_ai_panel is called once for that page with generate=true (not earlier) | useReflectIdle.test.ts QR-1; QuietReflection.test.tsx QR-5 |
| TC-3 | AC-3 | unit | Given a pending ask after a save When a keystroke cancels it Then nothing is asked until the next save schedules again, and that one fires after a full window | useReflectIdle.test.ts QR-2 |
| TC-4 | AC-4 | unit + integration | Given a page below the minimum (incl. unspaced Chinese text counted by characters) When time passes Then no ask is made | useReflectIdle.test.ts QR-3; QuietReflection.test.tsx QR-6 |
| TC-5 | AC-5 | unit (Rust) + integration | Given an entry with related pages and no stored reflection When the panel is built with generate=false Then the chat model is never called and the state is not_requested; opening an old entry calls get_ai_panel with generate=false | prompt/mod.rs lookup_without_generate_never_calls_the_model; QuietReflection.test.tsx QR-7 |
| TC-6 | AC-6 | unit (Rust) | Given a stored reflection When the panel is built with generate=false Then it returns Ready with that reflection and the model call count does not change | prompt/mod.rs lookup_without_generate_shows_a_stored_reflection |
| TC-7 | AC-7 | integration | Given the not_requested panel When Look back is clicked Then get_ai_panel is called with generate=true | QuietReflection.test.tsx QR-7 |
| TC-8 | AC-8 | unit (Rust) + component | Given related pages before and after the open page When N memories is opened Then groups Earlier then Later show the right cards and a card opens its entry | AiPanel.test.tsx MS-1; prompt/mod.rs ready_panel_groups_neighbours_earlier_and_later |
| TC-9 | AC-9 | component | Given related pages on one side only When N memories is opened Then only that group is shown | AiPanel.test.tsx MS-2 |
| TC-10 | AC-10 | unit (Rust) | Given many related pages When the panel is built Then each side has at most 3, Earlier newest-first, Later oldest-first | prompt/mod.rs ready_panel_groups_neighbours_earlier_and_later |
| TC-11 | AC-11 | unit (Rust, existing) | Given an entry with related pages When a reflection is generated Then related has the 3 nearest and the prompt contains each snippet | prompt/mod.rs tc7_related_memories_cite_sources, tc9_reflection_context_is_honest |
| TC-13 | AC-12 | integration | Given a journal with an older page When it is unlocked Then get_ai_panel is called for the latest page with generate=false and its reflection shows | QuietReflection.test.tsx QR-8 |
| TC-12 | AC-2, AC-5, AC-7 | manual | In the real app: write a new page, stop, wait ~30 s → memories arrive; open an old page → no model activity; click Look back → it asks | user, real window |

## Manual checklist (TC-12)
- [ ] New page, ~40 words, stop typing: nothing for ~30 s, then memories and a reflection
- [ ] Keep typing past the wait: nothing arrives mid-thought
- [ ] Open an older page: stored reflection shows, or a quiet "Look back"; Activity dot stays idle
- [ ] "N memories" shows Earlier and Later groups

## Measurements (provisional, not pass/fail)
| What | How |
|------|-----|
| Is 30 s the right wait? | use it for a week; note if it feels late or early |
| Is 200 characters the right minimum? | note short pages that deserved a reflection |
| Pool 12 / 3 per side enough? | look at whether one side is often empty for older pages |
